/**
 * API Server Entry Point
 * 
 * HTTP endpoints:
 * - POST /analyze - Analiz işini kuyruğa ekle
 * - GET /status/:jobId - İş durumunu kontrol et
 * - GET /analysis/:poolId - Havuz analizini getir (cache'ten veya DB'den)
 * - GET /health - Sistem sağlık kontrolü
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { PoolAnalysisInputSchema } from './lib/types';
import { addAnalysisJob, getJobStatus, getQueueStats } from './lib/queue';
import { getCachedAnalysis, healthCheck as cacheHealthCheck } from './lib/cache';
import { getRecentAnalysis, healthCheck as supabaseHealthCheck } from './lib/supabase';
import { heliusClient } from './lib/helius-client';

// Environment validation
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

/**
 * POST /analyze
 * Yeni bir havuz analizi başlat
 */
app.post('/analyze', async (c) => {
  try {
    const body = await c.req.json();
    
    // Input validation
    const input = PoolAnalysisInputSchema.parse(body);
    
    // Önce cache kontrolü (gereksiz analiz yapmamak için)
    if (!input.options?.skipCache) {
      const cached = await getCachedAnalysis(input.poolId);
      if (cached) {
        console.log(`⚡ Cache hit for pool: ${input.poolId}`);
        return c.json({
          status: 'cached',
          poolId: input.poolId,
          result: cached,
          message: 'Analysis retrieved from cache (max 5 min old)',
        });
      }
    }
    
    // İşi kuyruğa ekle
    const job = await addAnalysisJob({
      poolId: input.poolId,
      userId: input.userId,
      options: input.options,
    });
    
    console.log(`📥 New analysis job queued: ${job.id} for pool ${input.poolId}`);
    
    return c.json({
      status: 'queued',
      jobId: job.id,
      poolId: input.poolId,
      message: 'Analysis job queued successfully',
      estimatedTime: '30-60 seconds',
    }, 202); // 202 Accepted
    
  } catch (error: any) {
    console.error('❌ /analyze error:', error.message);
    
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Validation error',
        details: error.issues,
      }, 400);
    }
    
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /status/:jobId
 * İş durumunu kontrol et
 */
app.get('/status/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    
    const status = await getJobStatus(jobId);
    
    if (!status) {
      return c.json({
        error: 'Job not found',
        jobId,
      }, 404);
    }
    
    return c.json(status);
    
  } catch (error: any) {
    console.error('❌ /status error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /analysis/:poolId
 * Havuz analizini getir (cache > DB)
 */
app.get('/analysis/:poolId', async (c) => {
  try {
    const poolId = c.req.param('poolId');
    
    // 1. Cache'e bak
    const cached = await getCachedAnalysis(poolId);
    if (cached) {
      return c.json({
        source: 'cache',
        poolId,
        result: cached,
      });
    }
    
    // 2. DB'ye bak
    const dbResult = await getRecentAnalysis(poolId, 3600); // Son 1 saat
    if (dbResult) {
      // Parse the analysis_report JSON string back to object
      const parsedResult = typeof dbResult.analysis_report === 'string' 
        ? JSON.parse(dbResult.analysis_report)
        : dbResult.analysis_report;
      
      return c.json({
        source: 'database',
        poolId,
        result: parsedResult,
        generatedAt: dbResult.generated_at,
      });
    }
    
    // 3. Bulunamadı
    return c.json({
      error: 'Analysis not found',
      poolId,
      message: 'No recent analysis found for this pool. Please submit a new analysis request.',
    }, 404);
    
  } catch (error: any) {
    console.error('❌ /analysis error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /health
 * Sistem sağlık kontrolü
 */
app.get('/health', async (c) => {
  const checks = {
    server: 'ok',
    redis: 'unknown',
    supabase: 'unknown',
    helius: 'unknown',
    timestamp: new Date().toISOString(),
  };
  
  try {
    // Redis health
    await cacheHealthCheck();
    checks.redis = 'ok';
  } catch (error) {
    checks.redis = 'error';
  }
  
  try {
    // Supabase health
    await supabaseHealthCheck();
    checks.supabase = 'ok';
  } catch (error) {
    checks.supabase = 'error';
  }
  
  try {
    // Helius health
    await heliusClient.healthCheck();
    checks.helius = 'ok';
  } catch (error) {
    checks.helius = 'error';
  }
  
  const allOk = Object.values(checks).every((v) => v === 'ok' || v === checks.timestamp);
  
  return c.json(checks, allOk ? 200 : 503);
});

/**
 * GET /stats
 * Kuyruk istatistikleri (admin/monitoring için)
 */
app.get('/stats', async (c) => {
  try {
    const stats = await getQueueStats();
    return c.json(stats);
  } catch (error: any) {
    console.error('❌ /stats error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /
 * Root endpoint
 */
app.get('/', (c) => {
  return c.json({
    service: 'Solana Liquidity Analysis Agent',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /analyze': 'Submit a new pool analysis',
      'GET /status/:jobId': 'Check job status',
      'GET /analysis/:poolId': 'Get analysis result',
      'GET /health': 'System health check',
      'GET /stats': 'Queue statistics',
    },
    docs: 'https://github.com/yourusername/xfroraproje',
  });
});

/**
 * 404 Handler
 */
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    path: c.req.path,
  }, 404);
});

/**
 * Error Handler
 */
app.onError((err, c) => {
  console.error('💥 Unhandled error:', err);
  return c.json({
    error: 'Internal server error',
    message: err.message,
  }, 500);
});

/**
 * Start server
 */
console.log('🚀 Solana Liquidity Analysis API Server');
console.log('==========================================');
console.log(`📅 Started at: ${new Date().toISOString()}`);
console.log(`🔧 Runtime: ${process.version}`);
console.log(`💻 Platform: ${process.platform}`);
console.log(`🌐 Port: ${PORT}`);
console.log('');

export default {
  port: PORT,
  fetch: app.fetch,
};

