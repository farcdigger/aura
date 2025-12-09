/**
 * BullMQ Worker - Kuyruktan job alıp Solana havuz analizlerini işler
 * 
 * Bu worker:
 * - Redis kuyruğundan analiz isteklerini alır
 * - Helius API'den blockchain verileri çeker
 * - Daydreams/Anthropic Claude ile analiz yapar
 * - Sonuçları Supabase'e kaydeder ve Redis'e cache'ler
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import type { QueueJobData } from './lib/types';
import { BirdeyeClient } from './lib/birdeye-client';
import { buildAnalysisPrompt, validateAnalysisResponse, parseRiskScore } from './lib/claude-prompt';
import { saveAnalysis } from './lib/supabase';
import { setCachedAnalysis } from './lib/cache';
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
  const { poolId, userId, options } = job.data;
  
  console.log(`\n🔄 [Job ${job.id}] Starting analysis for pool: ${poolId}`);
  console.log(`👤 User: ${userId || 'anonymous'}`);
  
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
  
  try {
    // 1. Pool bilgilerini çek (Birdeye) - Lenient validation
    console.log(`📡 [Job ${job.id}] Validating pool exists...`);
    const poolExists = await birdeyeClient.validatePoolExists(poolId);
    if (!poolExists) {
      console.warn(`⚠️ [Job ${job.id}] Pool validation failed, but continuing (may be Pump.fun pool)...`);
    }
    await job.updateProgress(20);
    
    // 2. Pool reserves çek (Birdeye) - Try to get, but fallback to DexScreener if fails
    console.log(`🔍 [Job ${job.id}] Fetching pool reserves from Birdeye...`);
    let reserves: AdjustedPoolReserves;
    try {
      reserves = await birdeyeClient.getPoolData(poolId);
    } catch (error: any) {
      console.warn(`⚠️ [Job ${job.id}] Failed to fetch pool data from Birdeye: ${error.message}`);
      console.warn(`⚠️ [Job ${job.id}] Trying DexScreener as fallback for liquidity data...`);
      
      // Fallback: Get liquidity from DexScreener (FREE API, no rate limit issues!)
      let liquidityUsd = 0;
      let dexId = 'Unknown';
      let tokenAReserve = 0;
      let tokenBReserve = 0;
      let tokenAMint = 'So11111111111111111111111111111111111111112'; // SOL default
      let tokenBMint = job.data.tokenMint || 'UNKNOWN';
      
      try {
        if (job.data.tokenMint) {
          const { findBestPoolViaDexScreener } = await import('./lib/dexscreener-client');
          const dexScreenerData = await findBestPoolViaDexScreener(job.data.tokenMint);
          
          // ✅ IMPORTANT: Use DexScreener data if pool ID matches OR if it's the best pool for this token
          // Pool discovery already found the best pool, so we should use DexScreener data for that pool
          if (dexScreenerData) {
            // Check if DexScreener found the same pool (most likely) or use it anyway if it's the best pool
            const poolMatches = dexScreenerData.poolAddress.toLowerCase() === poolId.toLowerCase();
            
            if (poolMatches) {
              console.log(`✅ [Job ${job.id}] DexScreener pool matches job pool ID`);
            } else {
              console.warn(`⚠️ [Job ${job.id}] DexScreener pool differs from job pool ID`);
              console.warn(`⚠️ [Job ${job.id}] Job pool: ${poolId}`);
              console.warn(`⚠️ [Job ${job.id}] DexScreener pool: ${dexScreenerData.poolAddress}`);
              console.warn(`⚠️ [Job ${job.id}] Using DexScreener pool data anyway (it's the best pool for this token)`);
            }
            
            liquidityUsd = dexScreenerData.liquidityUsd || 0;
            dexId = dexScreenerData.dexLabel || 'Unknown';
            
            // ✅ Use DexScreener reserve amounts if available
            if (dexScreenerData.baseToken && dexScreenerData.quoteToken) {
              // Determine which token is which based on addresses
              const requestedToken = job.data.tokenMint.toLowerCase();
              const baseTokenAddress = dexScreenerData.baseToken.address.toLowerCase();
              const quoteTokenAddress = dexScreenerData.quoteToken.address.toLowerCase();
              
              if (baseTokenAddress === requestedToken) {
                // Requested token is base token
                tokenBMint = dexScreenerData.baseToken.address;
                tokenAMint = dexScreenerData.quoteToken.address;
                tokenBReserve = dexScreenerData.liquidityBase || 0;
                tokenAReserve = dexScreenerData.liquidityQuote || 0;
              } else {
                // Requested token is quote token
                tokenBMint = dexScreenerData.quoteToken.address;
                tokenAMint = dexScreenerData.baseToken.address;
                tokenBReserve = dexScreenerData.liquidityQuote || 0;
                tokenAReserve = dexScreenerData.liquidityBase || 0;
              }
            }
            
            console.log(`✅ [Job ${job.id}] DexScreener provided liquidity data: $${liquidityUsd.toLocaleString()}`);
            console.log(`✅ [Job ${job.id}] Reserve amounts: Token A=${tokenAReserve.toLocaleString()}, Token B=${tokenBReserve.toLocaleString()}`);
          } else {
            console.warn(`⚠️ [Job ${job.id}] DexScreener returned no data for token`);
          }
        }
      } catch (dexError: any) {
        console.warn(`⚠️ [Job ${job.id}] DexScreener fallback also failed: ${dexError.message}`);
      }
      
      // Calculate LP supply from reserves (simplified AMM formula)
      // LP supply ≈ sqrt(tokenA * tokenB) for constant product AMMs
      let lpSupply: string | undefined = undefined;
      if (tokenAReserve > 0 && tokenBReserve > 0) {
        const calculatedLP = Math.sqrt(tokenAReserve * tokenBReserve);
        lpSupply = calculatedLP.toLocaleString('en-US', { maximumFractionDigits: 0 });
      }
      
      // Create reserves object with DexScreener liquidity and reserves
      reserves = {
        tokenAMint: tokenAMint,
        tokenBMint: tokenBMint,
        tokenAReserve: tokenAReserve, // ✅ Use DexScreener reserve amounts
        tokenBReserve: tokenBReserve, // ✅ Use DexScreener reserve amounts
        tvlUSD: liquidityUsd, // ✅ Use DexScreener liquidity as TVL
        lpSupply, // ✅ Calculate LP supply from reserves
        poolStatus: 'Active',
        poolType: dexId,
      };
      
      console.log(`📊 [Job ${job.id}] Fallback reserves created with TVL: $${liquidityUsd.toLocaleString()}, Reserves: A=${tokenAReserve.toLocaleString()}, B=${tokenBReserve.toLocaleString()}`);
    }
    await job.updateProgress(30);
    
    // 3. Token metadata (Birdeye)
    console.log(`🪙 [Job ${job.id}] Fetching token metadata from Birdeye...`);
    const [tokenA, tokenB] = await Promise.all([
      birdeyeClient.getTokenMetadata(reserves.tokenAMint),
      birdeyeClient.getTokenMetadata(reserves.tokenBMint),
    ]);
    await job.updateProgress(40);
    
    // 4. Transaction history çek (Birdeye)
    console.log(`📊 [Job ${job.id}] Fetching transaction history from Birdeye...`);
    console.log(`📊 [Job ${job.id}] Target: ${options?.transactionLimit || 10000} swaps`);
    const txLimit = options?.transactionLimit || 10000; // Production: 10,000 swaps (Lite plan)
    
    const swaps = await birdeyeClient.getSwapTransactions(poolId, txLimit, job.data.tokenMint);
    
    // Detailed swap statistics
    console.log(`\n📊 [Job ${job.id}] ========== SWAP DATA SUMMARY ==========`);
    console.log(`📊 [Job ${job.id}] Total Swaps Fetched: ${swaps.length}`);
    
    // ⚠️ CRITICAL: NO SWAP DATA = NO AI ANALYSIS (prevents wasting API credits)
    if (swaps.length === 0) {
      console.error(`❌ [Job ${job.id}] ========================================`);
      console.error(`❌ [Job ${job.id}] NO SWAP DATA - ABORTING ANALYSIS`);
      console.error(`❌ [Job ${job.id}] ========================================`);
      console.error(`❌ [Job ${job.id}] Reasons this might happen:`);
      console.error(`❌ [Job ${job.id}]   1. Pool has no trading activity`);
      console.error(`❌ [Job ${job.id}]   2. Birdeye API endpoint doesn't support this pool type`);
      console.error(`❌ [Job ${job.id}]   3. Birdeye Standard plan doesn't support swap endpoints`);
      console.error(`❌ [Job ${job.id}]   4. Wrong pool address or token mint`);
      console.error(`❌ [Job ${job.id}] ========================================`);
      throw new Error('No swap data available for analysis. Cannot proceed without transaction history.');
    }
    
    if (swaps.length > 0) {
      const swapsWithUsd = swaps.filter(s => s.amountInUsd !== undefined || s.amountOutUsd !== undefined);
      const totalUsdVolume = swaps.reduce((sum, s) => sum + (s.amountInUsd || s.amountOutUsd || 0), 0);
      const buyCount = swaps.filter(s => s.direction === 'buy').length;
      const sellCount = swaps.filter(s => s.direction === 'sell').length;
      const uniqueWallets = new Set(swaps.map(s => s.wallet)).size;
      
      console.log(`📊 [Job ${job.id}] Swaps with USD data: ${swapsWithUsd.length}/${swaps.length} (${((swapsWithUsd.length / swaps.length) * 100).toFixed(1)}%)`);
      console.log(`📊 [Job ${job.id}] Total USD Volume: $${totalUsdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`📊 [Job ${job.id}] Buy/Sell Distribution: ${buyCount} buys (${((buyCount / swaps.length) * 100).toFixed(1)}%) / ${sellCount} sells (${((sellCount / swaps.length) * 100).toFixed(1)}%)`);
      console.log(`📊 [Job ${job.id}] Unique Wallets: ${uniqueWallets}`);
      
      // Top 5 wallets by USD volume
      const walletVolumes = new Map<string, number>();
      swaps.forEach(s => {
        const volume = s.amountInUsd || s.amountOutUsd || 0;
        walletVolumes.set(s.wallet, (walletVolumes.get(s.wallet) || 0) + volume);
      });
      
      const topWallets = Array.from(walletVolumes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      if (topWallets.length > 0) {
        console.log(`📊 [Job ${job.id}] Top 5 Wallets by USD Volume:`);
        topWallets.forEach(([wallet, volume], i) => {
          const walletSwaps = swaps.filter(s => s.wallet === wallet);
          const walletBuys = walletSwaps.filter(s => s.direction === 'buy').length;
          const walletSells = walletSwaps.filter(s => s.direction === 'sell').length;
          console.log(`📊 [Job ${job.id}]   ${i + 1}. ${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 4)}: $${volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${walletSwaps.length} swaps: ${walletBuys}B/${walletSells}S)`);
        });
      }
      
      // Sample swaps (first 3)
      console.log(`📊 [Job ${job.id}] Sample Swaps (first 3):`);
      swaps.slice(0, 3).forEach((swap, i) => {
        const date = new Date(swap.timestamp);
        const usdAmount = swap.amountInUsd || swap.amountOutUsd || 0;
        console.log(`📊 [Job ${job.id}]   ${i + 1}. ${swap.direction.toUpperCase()} | Wallet: ${swap.wallet.substring(0, 8)}... | USD: $${usdAmount.toFixed(2)} | Time: ${date.toISOString()}`);
      });
    } else {
      console.warn(`⚠️ [Job ${job.id}] ⚠️ NO SWAPS FETCHED! This may indicate:`);
      console.warn(`⚠️ [Job ${job.id}]    - Pool has no swap history`);
      console.warn(`⚠️ [Job ${job.id}]    - Birdeye API endpoint issue`);
      console.warn(`⚠️ [Job ${job.id}]    - Standard plan may not support this endpoint`);
    }
    console.log(`📊 [Job ${job.id}] ===========================================\n`);
    
    // Convert swaps to TransactionSummary format
    const { analyzeTransactions } = await import('./lib/transaction-parser');
    const transactions = analyzeTransactions(swaps);
    
    console.log(`📊 [Job ${job.id}] Transaction Analysis Results:`);
    console.log(`📊 [Job ${job.id}]    - Total: ${transactions.totalCount}`);
    console.log(`📊 [Job ${job.id}]    - Buys: ${transactions.buyCount} (${((transactions.buyCount / transactions.totalCount) * 100).toFixed(1)}%)`);
    console.log(`📊 [Job ${job.id}]    - Sells: ${transactions.sellCount} (${((transactions.sellCount / transactions.totalCount) * 100).toFixed(1)}%)`);
    console.log(`📊 [Job ${job.id}]    - Avg Volume USD: $${transactions.avgVolumeUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`📊 [Job ${job.id}]    - Unique Wallets: ${transactions.uniqueWallets || 0}`);
    console.log(`📊 [Job ${job.id}]    - Top Wallet Share: ${transactions.topWallets[0]?.volumeShare.toFixed(1) || 0}%`);
    
    await job.updateProgress(60);
    
    // 4.5. PHASE 3: Historical trend analysis (7 days)
    console.log(`📈 [Job ${job.id}] PHASE 3: Analyzing historical trend...`);
    let poolHistory: any = undefined;
    try {
      const { getPoolHistoryTrend } = await import('./lib/pool-history');
      const { supabase } = await import('./lib/supabase');
      poolHistory = await getPoolHistoryTrend(supabase, poolId, 7);
      console.log(`📈 [Job ${job.id}] ✅ Historical trend: ${poolHistory.tvl.trend} TVL, ${poolHistory.volume.trend} volume`);
    } catch (error: any) {
      console.warn(`[Job ${job.id}] ⚠️ Historical trend analysis failed: ${error.message}`);
      // Continue without historical data
    }
    await job.updateProgress(65);
    
    // 4.6. PHASE 3: Algorithmic risk scoring
    console.log(`🎯 [Job ${job.id}] PHASE 3: Calculating algorithmic risk score...`);
    let riskScoreBreakdown: any = undefined;
    try {
      const { calculateRiskScore } = await import('./lib/risk-scorer');
      riskScoreBreakdown = calculateRiskScore(reserves, tokenA, tokenB, transactions, poolHistory);
      console.log(`🎯 [Job ${job.id}] ✅ Algorithmic risk: ${riskScoreBreakdown.totalScore}/100 (${riskScoreBreakdown.riskLevel})`);
    } catch (error: any) {
      console.warn(`[Job ${job.id}] ⚠️ Risk scoring failed: ${error.message}`);
      // Continue without risk breakdown
    }
    await job.updateProgress(70);
    
    // 5. Claude prompt oluştur
    console.log(`🤖 [Job ${job.id}] Building AI analysis prompt...`);
    const prompt = buildAnalysisPrompt({
      poolId,
      tokenA,
      tokenB,
      reserves, // Now includes TVL, pool health, etc.
      transactions,
      poolHistory, // PHASE 3: Historical trend
    });
    
    // 6. Claude'a gönder (Daydreams Inference API - using fetch like yama-agent)
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
    
    // 7. Yanıtı parse et ve validate et
    console.log(`✅ [Job ${job.id}] Parsing AI response...`);
    const rawResponse = result.choices?.[0]?.message?.content || '';
    
    // Validate the response
    const validation = validateAnalysisResponse(rawResponse);
    if (!validation.isValid) {
      console.warn(`[Job ${job.id}] Analysis missing sections:`, validation.missingSections);
    }
    
    // Parse risk score from response
    const riskScore = parseRiskScore(rawResponse);
    
    // Build complete AnalysisResult object
    const analysisResult = {
      poolId,
      tokenA,
      tokenB,
      reserves,
      transactions,
      riskAnalysis: rawResponse,
      riskScore,
      generatedAt: new Date().toISOString(),
      modelUsed: model,
      poolHistory, // PHASE 3: Historical trend
      riskScoreBreakdown, // PHASE 3: Algorithmic risk score
    };
    
    // 8. Supabase'e kaydet
    console.log(`💾 [Job ${job.id}] Saving to Supabase...`);
    // userWallet'ı job data'dan al (frontend'den gelecek)
    const userWallet = job.data.userWallet;
    const savedRecord = await saveAnalysis(analysisResult, userId, userWallet);
    
    if (!savedRecord) {
      throw new Error('Failed to save analysis to database');
    }
    
    // ❌ CACHE REMOVED: No caching, always fresh data
    console.log(`✅ [Job ${job.id}] Analysis completed (no cache, always fresh)`);
    
    await job.updateProgress(100);
    
    console.log(`✅ [Job ${job.id}] Analysis completed successfully!`);
    console.log(`📄 Record ID: ${savedRecord.id}`);
    console.log(`⚠️  Risk Score: ${analysisResult.riskScore}/100`);
    
    // Helper function to serialize BigInt values
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
    
    // Job sonucu - BigInt'leri serialize et
    return {
      success: true,
      recordId: savedRecord.id,
      poolId,
      riskScore: analysisResult.riskScore,
      analysisResult: serializeBigInt(analysisResult),
    };
    
  } catch (error: any) {
    console.error(`❌ [Job ${job.id}] Analysis failed:`, error.message);
    
    // Detaylı hata logging
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        data: error.response.data,
      });
    }
    
    throw error; // BullMQ retry mekanizması devreye girecek
  }
}

/**
 * Worker instance oluştur
 */
const worker = new Worker<QueueJobData>(
  'pool-analysis', // Queue ismi (queue.ts ile aynı olmalı)
  processAnalysis,
  {
    connection: redis, // Redis bağlantısını paylaş
    concurrency: WORKER_CONFIG.concurrency,
    lockDuration: WORKER_CONFIG.lockDuration,
    lockRenewTime: WORKER_CONFIG.lockRenewTime,
    maxStalledCount: 2, // 2 kez stall olursa job fail
    stalledInterval: 30000, // 30 saniyede bir stalled job kontrolü
  }
);

/**
 * Event Listeners
 */

worker.on('ready', () => {
  console.log('🚀 Worker is ready and waiting for jobs...');
  console.log(`⚙️  Concurrency: ${WORKER_CONFIG.concurrency}`);
  console.log(`🔒 Lock Duration: ${WORKER_CONFIG.lockDuration / 1000}s`);
  console.log(`🤖 Model: ${process.env.REPORT_MODEL || 'openai/gpt-4o'}`);
  console.log(`📊 Transaction Limit: 10,000 swaps (Lite plan)`);
  console.log(`⚡ Rate Limit: 15 RPS (Lite plan)`);
  console.log(`📅 Weekly Limit: 140 reports/week`);
});

worker.on('active', (job) => {
  console.log(`\n▶️  [Job ${job.id}] Started processing...`);
});

worker.on('completed', (job, result) => {
  console.log(`\n✅ [Job ${job.id}] Completed in ${Date.now() - job.timestamp}ms`);
  console.log(`   Pool: ${result.poolId}`);
  console.log(`   Risk Score: ${result.riskScore}/100`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`\n❌ [Job ${job.id}] Failed after ${job.attemptsMade} attempts`);
    console.error(`   Error: ${err.message}`);
    console.error(`   Pool: ${job.data.poolId}`);
  } else {
    console.error(`\n❌ Job failed: ${err.message}`);
  }
});

worker.on('progress', (job, progress) => {
  console.log(`   📈 [Job ${job.id}] Progress: ${progress}%`);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  [Job ${jobId}] Stalled! Retrying...`);
});

worker.on('error', (err) => {
  console.error('💥 Worker error:', err);
});

/**
 * Graceful Shutdown
 */
const shutdown = async (signal: string) => {
  console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Worker'ı durdur (aktif job'ları bitirmesine izin ver)
    await worker.close();
    console.log('✅ Worker closed');
    
    // Redis bağlantısını kapat
    await redis.quit();
    console.log('✅ Redis connection closed');
    
    console.log('👋 Goodbye!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
};

// Signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('💥 Reason:', reason);
  // Production'da process.exit(1) yapılabilir
});

console.log('🎯 Solana Liquidity Analysis Worker');
console.log('====================================');
console.log(`📅 Started at: ${new Date().toISOString()}`);
console.log(`🔧 Node/Bun Version: ${process.version}`);
console.log(`💻 Platform: ${process.platform}`);
console.log('');

