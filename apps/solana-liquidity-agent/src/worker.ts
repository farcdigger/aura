/**
 * BullMQ Worker - Düzeltilmiş Versiyon (Scope Hatası Giderildi)
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import type { QueueJobData, AdjustedPoolReserves } from './lib/types'; // Types dosyanın güncel olduğundan emin ol
import { BirdeyeClient } from './lib/birdeye-client';
import { buildAnalysisPrompt, validateAnalysisResponse, parseRiskScore } from './lib/claude-prompt';
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
    
    // Type Narrowing (Artık null değil)
    const finalReserves = reserves as AdjustedPoolReserves;
    
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
    const txLimit = options?.transactionLimit || 10000;
    
    const swaps = await birdeyeClient.getSwapTransactions(poolId, txLimit, job.data.tokenMint);
    
    if (swaps.length === 0) {
      throw new Error('No swap data available for analysis.');
    }
    
    console.log(`📊 [Job ${job.id}] Swaps Fetched: ${swaps.length}`);
    
    const { analyzeTransactions } = await import('./lib/transaction-parser');
    const transactions = analyzeTransactions(swaps);
    
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
    
    const prompt = buildAnalysisPrompt({
      poolId,
      tokenA,
      tokenB,
      reserves: finalReserves, // ✅ DÜZELTİLDİ: Artık tanımlı
      transactions,
      poolHistory,
    });
    
    console.log(`🧠 [Job ${job.id}] Sending to AI...`);
    const model = process.env.REPORT_MODEL || 'openai/gpt-4o';
    
    const response = await fetch(`${DAYDREAMS_BASE_URL}/chat/completions`, {
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
    
    if (!response.ok) throw new Error(`AI API Error: ${response.statusText}`);
    
    const result: any = await response.json();
    await job.updateProgress(80);
    
    // ==================================================================================
    // 7. SAVING
    // ==================================================================================
    console.log(`✅ [Job ${job.id}] Parsing response...`);
    const rawResponse = result.choices?.[0]?.message?.content || '';
    const riskScore = parseRiskScore(rawResponse);
    
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
    const normalizedUserWallet = userWallet ? userWallet.toLowerCase().trim() : undefined;
    const savedRecord = await saveAnalysis(analysisResult, userId, normalizedUserWallet);
    
    if (!savedRecord) throw new Error('Failed to save to database');
    
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
    console.error(`❌ [Job ${job.id}] Process error:`, error.message);
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