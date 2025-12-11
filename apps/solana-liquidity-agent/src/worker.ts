/**
 * BullMQ Worker - Düzeltilmiş Versiyon (Scope Hatası Giderildi)
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import type { QueueJobData, AdjustedPoolReserves } from './lib/types'; // Types dosyanın güncel olduğundan emin ol
import { BirdeyeClient } from './lib/birdeye-client';
import { buildAnalysisPrompt, parseRiskScore } from './lib/claude-prompt';
import { saveAnalysis } from './lib/supabase';
import { redis } from './lib/cache';

// Environment validation
const REQUIRED_ENV = [
  'BIRDEYE_API_KEY',
  'INFERENCE_API_KEY',
  'REDIS_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Configuration
const WORKER_CONFIG = {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  maxJobsPerWorker: 100,
  lockDuration: 120000,
  lockRenewTime: 60000,
};

const INFERENCE_API_KEY = process.env.INFERENCE_API_KEY;
const DAYDREAMS_BASE_URL = process.env.DAYDREAMS_BASE_URL || 'https://api-beta.daydreams.systems/v1';

const birdeyeClient = new BirdeyeClient();

/**
 * Ana analiz fonksiyonu
 */
async function processAnalysis(job: Job<QueueJobData>) {
  const { poolId, userId, userWallet, options } = job.data;
  
  console.log(`\n🔄 [Job ${job.id}] Starting analysis for pool: ${poolId}`);
  console.log(`👤 User: ${userId || 'anonymous'}`);
  // ✅ DÜZELTME: userWallet kontrolü ve loglama
  console.log(`💼 User Wallet: ${userWallet ? userWallet.substring(0, 16) + '...' : 'NOT PROVIDED (will be null in database)'}`);
  
  await job.updateProgress(10);
  
  // Weekly Limit Check
  const { checkAndIncrementWeeklyLimit } = await import('./lib/weekly-limit');
  const limitStatus = await checkAndIncrementWeeklyLimit();
  
  console.log(`📊 [Job ${job.id}] Weekly reports: ${limitStatus.current}/${limitStatus.limit}`);
  
  if (!limitStatus.allowed) {
    throw new Error(`Weekly limit reached (${limitStatus.current}/${limitStatus.limit}).`);
  }
  
  // Daily Counter
  try {
    const { incrementDailyCount } = await import('./middleware/rate-limiter');
    const dailyCount = await incrementDailyCount();
    console.log(`📊 [Job ${job.id}] Daily analysis count: ${dailyCount}`);
  } catch (error: any) {
    console.warn(`[Job ${job.id}] Failed to increment daily count:`, error.message);
  }
  
  // ==================================================================================
  // 1. & 2. POOL VE REZERV VERİLERİNİ TOPLAMA (DÜZELTİLEN KISIM BURASI)
  // ==================================================================================
  
  // ✅ DÜZELTME: Değişkeni EN DIŞARIDA tanımlıyoruz. Artık kaybolmayacak.
  let reserves: AdjustedPoolReserves | null = null;
  let finalReserves: AdjustedPoolReserves | null = null; // ✅ Scope için dışarıda tanımlıyoruz

  try {
    // 1. Pool validasyonu
    console.log(`📡 [Job ${job.id}] Validating pool exists...`);
    await birdeyeClient.validatePoolExists(poolId); // Sonucu beklemesek de olur, log için
    await job.updateProgress(20);
    
    // 2. Birdeye'dan rezerv çekmeyi dene
    console.log(`🔍 [Job ${job.id}] Fetching pool reserves from Birdeye...`);
    
    try {
      reserves = await birdeyeClient.getPoolData(poolId);
      console.log(`✅ [Job ${job.id}] Birdeye reserves fetched successfully.`);

    } catch (birdeyeError: any) {
      console.warn(`⚠️ [Job ${job.id}] Birdeye failed, trying DexScreener fallback...`);
      
      // ==========================================================================
      // FALLBACK: DEXSCREENER LOGIC
      // ==========================================================================
      try {
        if (job.data.tokenMint) {
          const { findBestPoolViaDexScreener } = await import('./lib/dexscreener-client');
          // DexScreener'dan veri çek
          const dexScreenerData = await findBestPoolViaDexScreener(job.data.tokenMint);
          
          if (dexScreenerData) {
            // Pool ID kontrolü
            if (dexScreenerData.poolAddress.toLowerCase() === poolId.toLowerCase()) {
              console.log(`✅ [Job ${job.id}] DexScreener pool matches job pool ID`);
            } else {
              console.warn(`⚠️ [Job ${job.id}] Using DexScreener data as best alternative.`);
            }
            
            // LP Supply Tahmini
            let lpSupply: string | undefined = undefined;
            const resA = dexScreenerData.liquidityQuote || 0; // İsimlendirmeye dikkat (Quote/Base)
            const resB = dexScreenerData.liquidityBase || 0;
            
            if (resA > 0 && resB > 0) {
              const calculatedLP = Math.sqrt(resA * resB);
              lpSupply = calculatedLP.toLocaleString('en-US', { maximumFractionDigits: 0 });
            }
            
            // ✅ DÜZELTME: Dışarıdaki 'reserves' değişkenine atama yapıyoruz
            // ✅ Tip güvenliği: dexScreenerData null kontrolü yapıldıktan sonra buraya geliyoruz
            // baseToken ve quoteToken artık zorunlu alanlar (types.ts'de güncellendi)
            reserves = {
              tokenAMint: dexScreenerData.baseToken.address,
              tokenBMint: dexScreenerData.quoteToken.address,
              tokenAReserve: dexScreenerData.liquidityBase, // Artık zorunlu alan, || 0 gerekmez ama güvenlik için bırakıyoruz
              tokenBReserve: dexScreenerData.liquidityQuote, // Artık zorunlu alan
              tokenASymbol: dexScreenerData.baseToken.symbol,
              tokenBSymbol: dexScreenerData.quoteToken.symbol,
              tvlUSD: dexScreenerData.liquidityUsd || 0,
              lpSupply,
              poolStatus: 'Active',
              poolType: dexScreenerData.dexLabel,
            };
            
            console.log(`📊 [Job ${job.id}] Fallback reserves created successfully.`);
          }
        }
      } catch (dexError: any) {
        console.warn(`⚠️ [Job ${job.id}] DexScreener fallback also failed: ${dexError.message}`);
      }
    }

    // ✅ CHECK: Reserves verisi oluştu mu?
    if (!reserves) {
      throw new Error('Failed to fetch pool reserves from both Birdeye and DexScreener. Cannot proceed.');
    }
    
    // Type Narrowing (Artık null değil) - ✅ Dışarıda tanımlı değişkene atama
    finalReserves = reserves as AdjustedPoolReserves;
    
    await job.updateProgress(30);
    
    // ==================================================================================
    // 3. TOKEN METADATA
    // ==================================================================================
    console.log(`🪙 [Job ${job.id}] Fetching token metadata...`);
    const [tokenA, tokenB] = await Promise.all([
      birdeyeClient.getTokenMetadata(finalReserves.tokenAMint),
      birdeyeClient.getTokenMetadata(finalReserves.tokenBMint),
    ]);
    await job.updateProgress(40);
    
    // ==================================================================================
    // 4. TRANSACTION HISTORY
    // ==================================================================================
    console.log(`📊 [Job ${job.id}] Fetching transaction history...`);
    // ✅ Swap limitini 10000'e çıkardık (daha kapsamlı analiz için)
    const txLimit = options?.transactionLimit || 10000;
    
    const swaps = await birdeyeClient.getSwapTransactions(poolId, txLimit, job.data.tokenMint);
    
    if (swaps.length === 0) {
      throw new Error('No swap data available for analysis.');
    }
    
    console.log(`📊 [Job ${job.id}] Swaps Fetched: ${swaps.length}`);
    
    const { analyzeTransactions } = await import('./lib/transaction-parser');
    // ✅ DÜZELTME: reserves parametresini analyzeTransactions'a geçiyoruz
    const transactions = analyzeTransactions(swaps, finalReserves);
    
    console.log(`📊 [Job ${job.id}] Analysis: ${transactions.buyCount} Buys / ${transactions.sellCount} Sells`);
    
    await job.updateProgress(60);
    
    // ==================================================================================
    // 4.5. PHASE 3: HISTORY & RISK
    // ==================================================================================
    console.log(`📈 [Job ${job.id}] PHASE 3: Analyzing historical trend...`);
    let poolHistory: any = undefined;
    try {
      const { getPoolHistoryTrend } = await import('./lib/pool-history');
      const { supabase } = await import('./lib/supabase');
      poolHistory = await getPoolHistoryTrend(supabase, poolId, 7);
    } catch (error: any) {
      console.warn(`[Job ${job.id}] Historical trend failed (non-fatal): ${error.message}`);
    }
    
    let riskScoreBreakdown: any = undefined;
    try {
      const { calculateRiskScore } = await import('./lib/risk-scorer');
      riskScoreBreakdown = calculateRiskScore(finalReserves, tokenA, tokenB, transactions, poolHistory);
      console.log(`🎯 [Job ${job.id}] Algorithmic risk: ${riskScoreBreakdown.totalScore}/100`);
    } catch (error: any) {
      console.warn(`[Job ${job.id}] Risk scoring failed (non-fatal): ${error.message}`);
    }
    
    await job.updateProgress(70);
    
    // ==================================================================================
    // 5. CLAUDE AI ANALYSIS
    // ==================================================================================
    console.log(`🤖 [Job ${job.id}] Building AI analysis prompt...`);
    
    // ✅ KRİTİK KONTROL: finalReserves'in tanımlı olduğundan emin ol
    if (!finalReserves) {
      console.error(`❌ [Job ${job.id}] CRITICAL: finalReserves is undefined!`);
      throw new Error('finalReserves is undefined. Cannot build analysis prompt without pool reserves data.');
    }
    
    // ✅ DETAYLI LOG: Reserves verilerini logla (Railway için)
    console.log(`🔍 [Job ${job.id}] Reserves validation:`, {
      tokenAMint: finalReserves.tokenAMint?.substring(0, 16) + '...',
      tokenBMint: finalReserves.tokenBMint?.substring(0, 16) + '...',
      tokenAReserve: finalReserves.tokenAReserve,
      tokenBReserve: finalReserves.tokenBReserve,
      tvlUSD: finalReserves.tvlUSD,
      poolType: finalReserves.poolType,
      poolStatus: finalReserves.poolStatus,
      hasLpSupply: !!finalReserves.lpSupply,
      reservesType: typeof finalReserves,
      reservesKeys: Object.keys(finalReserves || {}),
    });
    
    // ✅ DETAYLI LOG: Prompt oluşturulmadan önce tüm parametreleri kontrol et
    console.log(`📝 [Job ${job.id}] Prompt parameters check:`, {
      hasPoolId: !!poolId,
      hasTokenA: !!tokenA,
      hasTokenB: !!tokenB,
      hasReserves: !!finalReserves,
      hasTransactions: !!transactions,
      hasPoolHistory: !!poolHistory,
      tokenASymbol: tokenA?.symbol,
      tokenBSymbol: tokenB?.symbol,
      transactionCount: transactions?.totalCount,
    });
    
    let prompt: string;
    try {
      prompt = buildAnalysisPrompt({
        poolId,
        tokenA,
        tokenB,
        reserves: finalReserves, // ✅ DÜZELTİLDİ: Artık tanımlı
        transactions,
        poolHistory,
      });
      
      // ✅ DETAYLI LOG: Prompt oluşturulduktan sonra logla (ilk 500 karakter)
      console.log(`✅ [Job ${job.id}] Prompt built successfully. Length: ${prompt.length} characters`);
      console.log(`📄 [Job ${job.id}] Prompt preview (first 500 chars):`, prompt.substring(0, 500));
      
      // ✅ DETAYLI LOG: Prompt içinde 'reserves' kelimesinin kullanımını kontrol et
      const reservesInPrompt = (prompt.match(/\breserves\b/gi) || []).length;
      const templateReservesInPrompt = (prompt.match(/\$\{.*reserves/gi) || []).length;
      console.log(`🔍 [Job ${job.id}] Prompt analysis:`, {
        totalLength: prompt.length,
        reservesWordCount: reservesInPrompt,
        templateReservesCount: templateReservesInPrompt,
        hasTemplateLiterals: prompt.includes('${'),
      });
      
    } catch (promptError: any) {
      console.error(`❌ [Job ${job.id}] ERROR building prompt:`, {
        error: promptError.message,
        stack: promptError.stack,
        reservesType: typeof finalReserves,
        reservesValue: finalReserves ? JSON.stringify(finalReserves).substring(0, 200) : 'null',
      });
      throw new Error(`Failed to build analysis prompt: ${promptError.message}`);
    }
    
    console.log(`🧠 [Job ${job.id}] Sending to AI...`);
    const model = process.env.REPORT_MODEL || 'openai/gpt-4o';
    
    let response: Response;
    try {
      response = await fetch(`${DAYDREAMS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INFERENCE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      
      // ✅ DETAYLI LOG: API response status
      console.log(`📡 [Job ${job.id}] AI API response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Job ${job.id}] AI API Error:`, {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText.substring(0, 500),
        });
        throw new Error(`AI API Error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
      
    } catch (fetchError: any) {
      console.error(`❌ [Job ${job.id}] ERROR fetching AI response:`, {
        error: fetchError.message,
        stack: fetchError.stack,
        url: DAYDREAMS_BASE_URL,
        model: model,
      });
      throw fetchError;
    }
    
    let result: any;
    try {
      result = await response.json();
      
      // ✅ DETAYLI LOG: AI response'u logla
      console.log(`✅ [Job ${job.id}] AI response received:`, {
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        hasMessage: !!result.choices?.[0]?.message,
        hasContent: !!result.choices?.[0]?.message?.content,
        contentLength: result.choices?.[0]?.message?.content?.length || 0,
        usage: result.usage,
      });
      
      // ✅ DETAYLI LOG: Response içeriğinin ilk 500 karakterini logla
      const responseContent = result.choices?.[0]?.message?.content || '';
      console.log(`📄 [Job ${job.id}] AI response preview (first 500 chars):`, responseContent.substring(0, 500));
      
      // ✅ DETAYLI LOG: Response içinde 'reserves' kelimesini kontrol et
      const reservesInResponse = (responseContent.match(/\breserves\b/gi) || []).length;
      const templateReservesInResponse = (responseContent.match(/\$\{.*reserves/gi) || []).length;
      if (reservesInResponse > 0 || templateReservesInResponse > 0) {
        console.warn(`⚠️ [Job ${job.id}] WARNING: Response contains 'reserves' references:`, {
          reservesWordCount: reservesInResponse,
          templateReservesCount: templateReservesInResponse,
        });
      }
      
    } catch (parseError: any) {
      console.error(`❌ [Job ${job.id}] ERROR parsing AI response:`, {
        error: parseError.message,
        stack: parseError.stack,
        responseStatus: response.status,
        responseText: await response.text().catch(() => 'Could not read response text'),
      });
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
    
    await job.updateProgress(80);
    
    // ==================================================================================
    // 7. SAVING
    // ==================================================================================
    console.log(`✅ [Job ${job.id}] Parsing response...`);
    const rawResponse = result.choices?.[0]?.message?.content || '';
    
    // ✅ DETAYLI LOG: Response parsing
    console.log(`📊 [Job ${job.id}] Response parsing:`, {
      responseLength: rawResponse.length,
      hasContent: rawResponse.length > 0,
      firstChars: rawResponse.substring(0, 100),
    });
    
    let riskScore: number;
    try {
      riskScore = parseRiskScore(rawResponse);
      console.log(`🎯 [Job ${job.id}] Risk score parsed: ${riskScore}`);
    } catch (parseError: any) {
      console.error(`❌ [Job ${job.id}] ERROR parsing risk score:`, {
        error: parseError.message,
        stack: parseError.stack,
      });
      riskScore = 50; // Fallback
    }
    
    // ✅ DETAYLI LOG: Analysis result oluşturulmadan önce kontrol
    console.log(`📦 [Job ${job.id}] Creating analysis result object...`);
    console.log(`🔍 [Job ${job.id}] Analysis result components:`, {
      hasPoolId: !!poolId,
      hasTokenA: !!tokenA,
      hasTokenB: !!tokenB,
      hasReserves: !!finalReserves,
      hasTransactions: !!transactions,
      hasRiskAnalysis: !!rawResponse,
      riskScore: riskScore,
      hasPoolHistory: !!poolHistory,
      hasRiskScoreBreakdown: !!riskScoreBreakdown,
    });
    
    const analysisResult = {
      poolId,
      tokenA,
      tokenB,
      reserves: finalReserves,
      transactions,
      riskAnalysis: rawResponse,
      riskScore,
      generatedAt: new Date().toISOString(),
      modelUsed: model,
      poolHistory,
      riskScoreBreakdown,
    };
    
    console.log(`💾 [Job ${job.id}] Saving to Supabase...`);
    // ✅ DÜZELTME: userWallet kontrolü ve detaylı loglama
    const normalizedUserWallet = userWallet ? userWallet.toLowerCase().trim() : undefined;
    
    console.log(`🔍 [Job ${job.id}] Wallet info for save:`, {
      originalUserWallet: userWallet ? userWallet.substring(0, 20) + '...' : 'undefined',
      normalizedUserWallet: normalizedUserWallet ? normalizedUserWallet.substring(0, 20) + '...' : 'undefined',
      userId: userId || 'undefined',
    });
    
    let savedRecord;
    try {
      savedRecord = await saveAnalysis(analysisResult, userId, normalizedUserWallet);
      
      if (!savedRecord) {
        console.error(`❌ [Job ${job.id}] CRITICAL: saveAnalysis returned null!`);
        throw new Error('Failed to save to database - saveAnalysis returned null');
      }
      
      console.log(`✅ [Job ${job.id}] Analysis saved successfully. Record ID: ${savedRecord.id}`);
      
    } catch (saveError: any) {
      console.error(`❌ [Job ${job.id}] ERROR saving to database:`, {
        error: saveError.message,
        stack: saveError.stack,
        analysisResultKeys: Object.keys(analysisResult),
        reservesType: typeof analysisResult.reserves,
      });
      throw saveError;
    }
    
    await job.updateProgress(100);
    console.log(`✅ [Job ${job.id}] SUCCESS! Record ID: ${savedRecord.id}`);
    
    // Helper function for serialization
    const serializeBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return obj.toString();
      if (Array.isArray(obj)) return obj.map(item => serializeBigInt(item));
      if (typeof obj === 'object') {
        const serialized: any = {};
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            serialized[key] = serializeBigInt(obj[key]);
          }
        }
        return serialized;
      }
      return obj;
    };
    
    return {
      success: true,
      recordId: savedRecord.id,
      poolId,
      riskScore,
      analysisResult: serializeBigInt(analysisResult),
    };
    
  } catch (error: any) {
    // ✅ DETAYLI LOG: Hata yakalama ve loglama (Railway için)
    console.error(`❌ [Job ${job.id}] Process error occurred:`, {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      errorType: typeof error,
      poolId: job.data.poolId,
      userId: job.data.userId,
      timestamp: new Date().toISOString(),
    });
    
    // ✅ DETAYLI LOG: Hata mesajında 'reserves' kelimesi var mı kontrol et
    if (error.message && error.message.toLowerCase().includes('reserves')) {
      console.error(`🔴 [Job ${job.id}] CRITICAL: Error message contains 'reserves':`, {
        fullMessage: error.message,
        stack: error.stack,
      });
    }
    
    // ✅ DETAYLI LOG: Scope'taki değişkenleri kontrol et
    try {
      console.error(`🔍 [Job ${job.id}] Scope check at error time:`, {
        hasPoolId: typeof poolId !== 'undefined',
        hasFinalReserves: typeof finalReserves !== 'undefined',
        finalReservesType: typeof finalReserves,
        finalReservesValue: finalReserves ? 'defined' : 'undefined',
        finalReservesKeys: finalReserves ? Object.keys(finalReserves) : [],
      });
    } catch (scopeError) {
      console.error(`⚠️ [Job ${job.id}] Could not check scope variables:`, scopeError);
    }
    
    throw error;
  }
}

/**
 * Worker Setup
 */
const worker = new Worker<QueueJobData>('pool-analysis', processAnalysis, {
  connection: redis,
  concurrency: WORKER_CONFIG.concurrency,
  lockDuration: WORKER_CONFIG.lockDuration,
  lockRenewTime: WORKER_CONFIG.lockRenewTime,
  maxStalledCount: 2,
});

worker.on('ready', () => console.log('🚀 Worker ready!'));
worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed: ${err.message}`));