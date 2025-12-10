/**
 * BullMQ Worker - Kuyruktan job alıp Solana havuz analizlerini işler
 * * Bu worker:
 * - Redis kuyruğundan analiz isteklerini alır
 * - Birdeye ve Fallback (DexScreener) üzerinden veriyi toplar
 * - Daydreams/Anthropic Claude ile analiz yapar
 * - Sonuçları Supabase'e kaydeder
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import type { QueueJobData, AdjustedPoolReserves } from './lib/types';
import { BirdeyeClient } from './lib/birdeye-client';
import { buildAnalysisPrompt, validateAnalysisResponse, parseRiskScore } from './lib/claude-prompt';
import { saveAnalysis } from './lib/supabase';
// import { setCachedAnalysis } from './lib/cache'; // Cache devre dışı
import { redis } from './lib/cache'; // Redis connection'ı paylaşıyoruz

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
  lockDuration: 120000, // 2 dakika - uzun analizler için
  lockRenewTime: 60000, // 1 dakikada bir lock yenile
};

// Daydreams API Configuration (using fetch like yama-agent)
const INFERENCE_API_KEY = process.env.INFERENCE_API_KEY;
const DAYDREAMS_BASE_URL = process.env.DAYDREAMS_BASE_URL || 'https://api-beta.daydreams.systems/v1';

// Birdeye Client (replaces Helius completely)
const birdeyeClient = new BirdeyeClient();

/**
 * Ana analiz fonksiyonu
 */
async function processAnalysis(job: Job<QueueJobData>) {
  const { poolId, userId, userWallet, options } = job.data;
  
  console.log(`\n🔄 [Job ${job.id}] Starting analysis for pool: ${poolId}`);
  console.log(`👤 User: ${userId || 'anonymous'}`);
  console.log(`👛 Wallet: ${userWallet || 'not provided'}`);
  
  // Progress tracking
  await job.updateProgress(10);
  
  // ✅ WEEKLY LIMIT CHECK
  const { checkAndIncrementWeeklyLimit } = await import('./lib/weekly-limit');
  const limitStatus = await checkAndIncrementWeeklyLimit();
  
  console.log(`📊 [Job ${job.id}] Weekly reports: ${limitStatus.current}/${limitStatus.limit}`);
  
  if (!limitStatus.allowed) {
    const resetDate = new Date(limitStatus.resetsAt);
    throw new Error(
      `Weekly limit reached (${limitStatus.current}/${limitStatus.limit}). ` +
      `Resets on ${resetDate.toLocaleDateString()} at ${resetDate.toLocaleTimeString()}.`
    );
  }
  
  // Increment daily analysis counter
  try {
    const { incrementDailyCount } = await import('./middleware/rate-limiter');
    const dailyCount = await incrementDailyCount();
    console.log(`📊 [Job ${job.id}] Daily analysis count: ${dailyCount}`);
  } catch (error: any) {
    console.warn(`[Job ${job.id}] Failed to increment daily count:`, error.message);
  }
  
  // ==================================================================================
  // 1. & 2. POOL VE REZERV VERİLERİNİ TOPLAMA (SCOPE FIX UYGULANDI)
  // ==================================================================================
  
  // ✅ KRİTİK: reserves değişkenini en dış kapsamda tanımlıyoruz.
  let reserves: AdjustedPoolReserves | null = null;

  try {
    // 1. Pool validasyonu (Opsiyonel, log amaçlı)
    console.log(`📡 [Job ${job.id}] Validating pool exists...`);
    const poolExists = await birdeyeClient.validatePoolExists(poolId);
    if (!poolExists) {
      console.warn(`⚠️ [Job ${job.id}] Pool validation failed (could be Pump.fun), continuing check...`);
    }
    await job.updateProgress(20);
    
    // 2. Birdeye'dan rezerv çekmeyi dene
    console.log(`🔍 [Job ${job.id}] Fetching pool reserves from Birdeye...`);
    
    try {
      // Birdeye API çağrısı
      reserves = await birdeyeClient.getPoolData(poolId);
      console.log(`✅ [Job ${job.id}] Birdeye reserves fetched successfully.`);

    } catch (birdeyeError: any) {
      console.warn(`⚠️ [Job ${job.id}] Failed to fetch pool data from Birdeye: ${birdeyeError.message}`);
      console.warn(`⚠️ [Job ${job.id}] Trying DexScreener as fallback for liquidity data...`);
      
      // ==========================================================================
      // FALLBACK: DEXSCREENER LOGIC
      // ==========================================================================
      let liquidityUsd = 0;
      let dexId = 'Unknown';
      let tokenAReserve = 0;
      let tokenBReserve = 0;
      let tokenAMint = 'So11111111111111111111111111111111111111112'; // Default SOL
      let tokenBMint = job.data.tokenMint || 'UNKNOWN';
      
      try {
        if (job.data.tokenMint) {
          const { findBestPoolViaDexScreener } = await import('./lib/dexscreener-client');
          const dexScreenerData = await findBestPoolViaDexScreener(job.data.tokenMint);
          
          if (dexScreenerData) {
            // Pool ID kontrolü
            const poolMatches = dexScreenerData.poolAddress.toLowerCase() === poolId.toLowerCase();
            
            if (poolMatches) {
              console.log(`✅ [Job ${job.id}] DexScreener pool matches job pool ID`);
            } else {
              console.warn(`⚠️ [Job ${job.id}] DexScreener pool differs but using as best alternative.`);
            }
            
            liquidityUsd = dexScreenerData.liquidityUsd || 0;
            dexId = dexScreenerData.dexLabel || 'Unknown';
            
            // Token adreslerini eşleştirme ve rezerv atama
            if (dexScreenerData.baseToken && dexScreenerData.quoteToken) {
              const requestedToken = job.data.tokenMint.toLowerCase();
              const baseTokenAddress = dexScreenerData.baseToken.address.toLowerCase();
              
              if (baseTokenAddress === requestedToken) {
                // Requested token is base
                tokenBMint = dexScreenerData.baseToken.address;
                tokenAMint = dexScreenerData.quoteToken.address;
                tokenBReserve = dexScreenerData.liquidityBase || 0;
                tokenAReserve = dexScreenerData.liquidityQuote || 0;
              } else {
                // Requested token is quote
                tokenBMint = dexScreenerData.quoteToken.address;
                tokenAMint = dexScreenerData.baseToken.address;
                tokenBReserve = dexScreenerData.liquidityQuote || 0;
                tokenAReserve = dexScreenerData.liquidityBase || 0;
              }
            }
            
            console.log(`✅ [Job ${job.id}] DexScreener provided liquidity data: $${liquidityUsd.toLocaleString()}`);
          }
        }
      } catch (dexError: any) {
        console.warn(`⚠️ [Job ${job.id}] DexScreener fallback also failed: ${dexError.message}`);
      }
      
      // LP Supply Tahmini Hesaplama
      let lpSupply: string | undefined = undefined;
      if (tokenAReserve > 0 && tokenBReserve > 0) {
        const calculatedLP = Math.sqrt(tokenAReserve * tokenBReserve);
        lpSupply = calculatedLP.toLocaleString('en-US', { maximumFractionDigits: 0 });
      }
      
      // ✅ KRİTİK: Dışarıdaki 'reserves' değişkenine atama yapıyoruz
      reserves = {
        tokenAMint: tokenAMint,
        tokenBMint: tokenBMint,
        tokenAReserve: tokenAReserve,
        tokenBReserve: tokenBReserve,
        tvlUSD: liquidityUsd,
        lpSupply,
        poolStatus: 'Active',
        poolType: dexId,
      };
      
      console.log(`📊 [Job ${job.id}] Fallback reserves created successfully.`);
    }

    // ✅ CHECK: Reserves verisi oluştu mu?
    if (!reserves) {
      throw new Error('Failed to fetch pool reserves from both Birdeye and DexScreener. Cannot proceed.');
    }

    // TypeScript için Type Narrowing: Artık reserves null olamaz
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
    
    // İşlem kontrolü
    if (swaps.length === 0) {
      throw new Error('No swap data available for analysis. Cannot proceed without transaction history.');
    }
    
    console.log(`📊 [Job ${job.id}] Swaps Fetched: ${swaps.length}`);
    
    // Transaction özeti oluşturma
    const { analyzeTransactions } = await import('./lib/transaction-parser');
    const transactions = analyzeTransactions(swaps);
    
    console.log(`📊 [Job ${job.id}] Transaction Analysis: ${transactions.buyCount} Buys / ${transactions.sellCount} Sells`);
    
    await job.updateProgress(60);
    
    // ==================================================================================
    // 4.5. PHASE 3: HISTORICAL TRENDS & RISK SCORING
    // ==================================================================================
    console.log(`📈 [Job ${job.id}] PHASE 3: Analyzing historical trend...`);
    let poolHistory: any = undefined;
    try {
      const { getPoolHistoryTrend } = await import('./lib/pool-history');
      const { supabase } = await import('./lib/supabase');
      poolHistory = await getPoolHistoryTrend(supabase, poolId, 7);
    } catch (error: any) {
      console.warn(`[Job ${job.id}] Historical trend analysis failed (non-fatal): ${error.message}`);
    }
    
    console.log(`🎯 [Job ${job.id}] PHASE 3: Calculating algorithmic risk score...`);
    let riskScoreBreakdown: any = undefined;
    try {
      const { calculateRiskScore } = await import('./lib/risk-scorer');
      // Burada 'finalReserves' kullanıyoruz, kesinlikle tanımlı
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
    
    // Prompt oluştururken kesinlikle tanımlı olan 'finalReserves' kullanılıyor
    const prompt = buildAnalysisPrompt({
      poolId,
      tokenA,
      tokenB,
      reserves: finalReserves, // ✅ Scope hatası düzeltildi
      transactions,
      poolHistory,
    });
    
    console.log(`🧠 [Job ${job.id}] Sending to AI for analysis...`);
    const model = process.env.REPORT_MODEL || 'openai/gpt-4o';
    const maxTokens = parseInt(process.env.MAX_COMPLETION_TOKENS || '4096', 10);
    
    const payload = {
      model,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };
    
    const response = await fetch(`${DAYDREAMS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INFERENCE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
    }
    
    const result = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    
    await job.updateProgress(80);
    
    // ==================================================================================
    // 7. RESPONSE PARSING & SAVING
    // ==================================================================================
    console.log(`✅ [Job ${job.id}] Parsing AI response...`);
    const rawResponse = result.choices?.[0]?.message?.content || '';
    
    // Validate response
    const validation = validateAnalysisResponse(rawResponse);
    if (!validation.isValid) {
      console.warn(`[Job ${job.id}] Analysis missing sections:`, validation.missingSections);
    }
    
    const riskScore = parseRiskScore(rawResponse);
    
    // Build final result object
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
    
    // Save to Supabase
    console.log(`💾 [Job ${job.id}] Saving to Supabase...`);
    const normalizedUserWallet = userWallet ? userWallet.toLowerCase().trim() : undefined;
    const savedRecord = await saveAnalysis(analysisResult, userId, normalizedUserWallet);
    
    if (!savedRecord) {
      throw new Error('Failed to save analysis to database');
    }
    
    await job.updateProgress(100);
    console.log(`✅ [Job ${job.id}] Analysis completed successfully! Record ID: ${savedRecord.id}`);
    
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
      riskScore: analysisResult.riskScore,
      analysisResult: serializeBigInt(analysisResult),
    };
    
  } catch (error: any) {
    console.error(`❌ [Job ${job.id}] Analysis process error:`, error.message);
    if (error.response) {
      console.error('API Error details:', error.response.data);
    }
    throw error;
  }
}

/**
 * Worker instance oluştur
 */
const worker = new Worker<QueueJobData>(
  'pool-analysis', // Queue ismi
  processAnalysis,
  {
    connection: redis,
    concurrency: WORKER_CONFIG.concurrency,
    lockDuration: WORKER_CONFIG.lockDuration,
    lockRenewTime: WORKER_CONFIG.lockRenewTime,
    maxStalledCount: 2,
    stalledInterval: 30000,
  }
);

/**
 * Event Listeners
 */
worker.on('ready', () => {
  console.log('🚀 Worker is ready and waiting for jobs...');
  console.log(`⚙️  Concurrency: ${WORKER_CONFIG.concurrency}`);
});

worker.on('active', (job) => {
  console.log(`\n▶️  [Job ${job.id}] Started processing...`);
});

worker.on('completed', (job, result) => {
  console.log(`\n✅ [Job ${job.id}] Completed in ${Date.now() - job.timestamp}ms`);
});

worker.on('failed', (job, err) => {
  console.error(`\n❌ [Job ${job ? job.id : 'unknown'}] Failed: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('💥 Worker error:', err);
});

/**
 * Graceful Shutdown
 */
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down...`);
  try {
    await worker.close();
    await redis.quit();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('🎯 Solana Liquidity Analysis Worker Started');