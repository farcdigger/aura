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
import { heliusClient } from './lib/helius-client';
import { buildAnalysisPrompt, validateAnalysisResponse, parseRiskScore } from './lib/claude-prompt';
import { saveAnalysis } from './lib/supabase';
import { setCachedAnalysis } from './lib/cache';
import { redis } from './lib/cache'; // Redis connection'ı paylaşıyoruz

// Environment validation
const REQUIRED_ENV = [
  'HELIUS_API_KEY',
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

/**
 * Ana analiz fonksiyonu
 */
async function processAnalysis(job: Job<QueueJobData>) {
  const { poolId, userId, options } = job.data;
  
  console.log(`\n🔄 [Job ${job.id}] Starting analysis for pool: ${poolId}`);
  console.log(`👤 User: ${userId || 'anonymous'}`);
  
  // Progress tracking
  await job.updateProgress(10);
  
  // Increment daily analysis counter
  try {
    const { incrementDailyCount } = await import('./middleware/rate-limiter');
    const dailyCount = await incrementDailyCount();
    console.log(`📊 [Job ${job.id}] Daily analysis count: ${dailyCount}`);
  } catch (error: any) {
    console.warn(`[Job ${job.id}] Failed to increment daily count:`, error.message);
  }
  
  try {
    // 1. Pool bilgilerini çek
    console.log(`📡 [Job ${job.id}] Fetching pool account info...`);
    await heliusClient.getPoolAccountInfo(poolId); // Validate pool exists
    await job.updateProgress(20);
    
    // 2. Pool reserves çek (artık TVL ve metadata dahil!)
    console.log(`🔍 [Job ${job.id}] Parsing pool reserves...`);
    const reserves = await heliusClient.getPoolReserves(poolId);
    await job.updateProgress(30);
    
    // 3. Token metadata (artık reserves'de var, ama validation için tekrar çekelim)
    console.log(`🪙 [Job ${job.id}] Fetching token metadata...`);
    const [tokenA, tokenB] = await Promise.all([
      heliusClient.getTokenMetadata(reserves.tokenAMint),
      heliusClient.getTokenMetadata(reserves.tokenBMint),
    ]);
    await job.updateProgress(40);
    
    // 4. Transaction history çek
    console.log(`📊 [Job ${job.id}] Fetching transaction history...`);
    const txLimit = options?.transactionLimit || 2000; // Phase 3: Balanced for quality vs rate limits
    const transactions = await heliusClient.getTransactionHistory(poolId, txLimit);
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
    const savedRecord = await saveAnalysis(analysisResult, userId);
    
    if (!savedRecord) {
      throw new Error('Failed to save analysis to database');
    }
    
    // 9. Redis cache'e yaz
    console.log(`⚡ [Job ${job.id}] Caching result...`);
    await setCachedAnalysis(poolId, analysisResult);
    
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
  console.log(`🤖 Model: ${process.env.REPORT_MODEL || 'claude-3-5-sonnet-20241022'}`);
  console.log(`📊 Transaction Limit: ${process.env.TRANSACTION_LIMIT || 2000}`);
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

