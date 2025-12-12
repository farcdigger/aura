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
import { addAnalysisJob, getJobStatus, getQueueStats, queue } from './lib/queue';
import { getCachedAnalysis, healthCheck as cacheHealthCheck } from './lib/cache';
import { getRecentAnalysis, getUserAnalyses, healthCheck as supabaseHealthCheck } from './lib/supabase';
import { BirdeyeClient } from './lib/birdeye-client';
import { findMostLiquidPoolForMint } from './lib/pool-discovery';
import { analysisRateLimiter, getSystemStatus, getQueueStats as getRateLimiterQueueStats, calculateEstimatedWaitTime } from './middleware/rate-limiter';
import { getWeeklyLimitStatus } from './lib/weekly-limit';

// Environment validation
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

/**
 * GET /system-status
 * Sistem durumu ve kuyruk bilgilerini getir
 */
app.get('/system-status', async (c) => {
  try {
    const status = await getSystemStatus(queue);
    return c.json(status);
  } catch (error: any) {
    console.error('[API] System status error:', error);
    return c.json({
      error: 'Failed to get system status',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /analyze (and /api/analyze alias)
 * Yeni bir havuz analizi başlat (HYBRID - Pool ID veya Token Mint)
 */
const analyzeHandlerFn = async (c: any) => {
  try {
    const body = await c.req.json();
    
    // Input validation
    const input = PoolAnalysisInputSchema.parse(body);
    
    let poolId: string;
    let discoveryMethod: 'direct' | 'auto-discovery' = 'direct';
    
    // ====================================================================
    // HYBRID INPUT HANDLING
    // ====================================================================
    
    if (input.poolId) {
      // Option 1: Direct pool ID provided
      poolId = input.poolId;
      console.log(`📍 Direct pool ID provided: ${poolId}`);
      
    } else if (input.tokenMint) {
      // Option 2: Token mint provided - auto-discover best pool
      console.log(`🔍 Token mint provided: ${input.tokenMint}`);
      console.log(`🎯 Using 3-Tier Pool Discovery (Known → Jupiter → Fallback)...`);
      
      discoveryMethod = 'auto-discovery';
      
      // Find best pool using 3-tier approach (super fast!)
      const bestPoolId = await findMostLiquidPoolForMint(input.tokenMint);
      
      if (!bestPoolId) {
        return c.json({
          error: 'Pool discovery failed',
          message: `No pools found for token: ${input.tokenMint}`,
          suggestion: 'Token might be too new or not have sufficient liquidity',
        }, 404);
      }
      
      poolId = bestPoolId;
      console.log(`✅ Best pool discovered: ${poolId}`);
      
    } else {
      // Should not happen due to schema validation
      return c.json({
        error: 'Invalid input',
        message: 'Either poolId or tokenMint must be provided',
      }, 400);
    }
    
    // ====================================================================
    // CACHE CHECK
    // ====================================================================
    
    // ❌ CACHE REMOVED: Always fresh data for memecoin volatility
    // Kullanıcı ücret ödüyor, her zaman canlı veri almalı
    console.log(`🔄 No cache - generating fresh analysis for pool: ${poolId}`);
    
    if (false) {  // Cache disabled
      const cached = null;
      if (cached) {
        console.log(`⚡ Cache hit for pool: ${poolId}`);
        return c.json({
          status: 'cached',
          poolId: poolId,
          tokenMint: input.tokenMint,
          discoveryMethod,
          result: cached,
          message: 'Analysis retrieved from cache (max 5 min old)',
        });
      }
    }
    
    // ====================================================================
    // FREE TICKET CHECK (before weekly limit check)
    // ====================================================================
    const { checkFreeTicket, useFreeTicket } = await import('./lib/free-tickets');
    const freeTicket = input.userWallet ? await checkFreeTicket(input.userWallet) : null;
    const hasFreeTicket = !!freeTicket;
    
    // ====================================================================
    // WEEKLY LIMIT CHECK (before queuing)
    // ====================================================================
    const limitStatus = await getWeeklyLimitStatus();
    if (limitStatus.remaining <= 0 && !hasFreeTicket) {
      return c.json({
        error: 'Weekly limit reached',
        limitInfo: {
          current: limitStatus.current,
          limit: limitStatus.limit,
          remaining: 0,
          resetsAt: limitStatus.resetsAt,
        },
      }, 429);
    }
    
    // If user has free ticket, use it
    if (hasFreeTicket && input.userWallet) {
      await useFreeTicket(input.userWallet);
      console.log(`🎫 Free ticket used by ${input.userWallet.substring(0, 10)}... (reason: ${freeTicket.reason})`);
    }
    
    // ====================================================================
    // QUEUE JOB
    // ====================================================================
    
    let job;
    try {
      job = await addAnalysisJob({
        poolId: poolId,
        userId: input.userId,
        userWallet: input.userWallet, // For user-specific tracking
        tokenMint: input.tokenMint, // Pass token mint to worker for Pump.fun support
        options: input.options,
      });
    } catch (queueError: any) {
      if (queueError.message && queueError.message.includes('Queue is full')) {
        return c.json({
          error: 'Queue is full',
          message: queueError.message,
          limitInfo: {
            current: limitStatus.current,
            limit: limitStatus.limit,
            remaining: limitStatus.remaining,
          },
        }, 429);
      }
      throw queueError;
    }
    
    console.log(`📥 New analysis job queued: ${job.id} for pool ${poolId}`);
    
    if (discoveryMethod === 'auto-discovery') {
      console.log(`🎯 Pool auto-discovered from token mint: ${input.tokenMint}`);
    }
    
    // Get queue position and estimated wait time
    const queueStats = await getRateLimiterQueueStats(queue);
    const queuePosition = queueStats.waiting + queueStats.active;
    const waitTime = calculateEstimatedWaitTime(queuePosition);
    
    // Get daily stats for user info
    const systemStatus = await getSystemStatus(queue);
    
    return c.json({
      status: 'queued',
      jobId: job.id,
      poolId: poolId,
      tokenMint: input.tokenMint,
      discoveryMethod,
      message: 'Analiz işlemi kuyruğa eklendi',
      queue: {
        position: queuePosition,
        estimatedWaitTime: waitTime.text,
        estimatedMinutes: waitTime.minutes,
      },
      dailyStats: {
        used: systemStatus.dailyUsed,
        remaining: systemStatus.dailyRemaining,
        limit: systemStatus.dailyLimit,
      },
    }, 202); // 202 Accepted
    
  } catch (error: any) {
    console.error('❌ /analyze error:', error.message);
    
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Validation error',
        details: error.issues,
      }, 400);
    }
    
    // Check if it's a queue full error
    if (error.message && error.message.includes('Queue is full')) {
      return c.json({
        error: 'Queue is full',
        message: error.message,
      }, 429);
    }
    
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
};

// Register handler for both /analyze and /api/analyze
app.post('/analyze', analysisRateLimiter(queue), analyzeHandlerFn);
app.post('/api/analyze', analysisRateLimiter(queue), analyzeHandlerFn);

/**
 * GET /status/:jobId (and /api/status/:jobId alias)
 * İş durumunu kontrol et
 */
const statusHandlerFn = async (c: any) => {
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
};

// Register handler for both /status/:jobId and /api/status/:jobId
app.get('/status/:jobId', statusHandlerFn);
app.get('/api/status/:jobId', statusHandlerFn);

/**
 * GET /analysis/:poolId
 * Havuz analizini getir (cache > DB)
 */
app.get('/analysis/:poolId', async (c) => {
  try {
    const poolId = c.req.param('poolId');
    
    // ❌ CACHE REMOVED: Always fresh data
    console.log(`🔄 No cache - checking database for pool: ${poolId}`);
    
    if (false) {  // Cache disabled
      const cached = null;
      if (cached) {
        return c.json({
          source: 'cache',
          poolId,
          result: cached,
        });
      }
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
 * GET /api/analyses
 * Kullanıcıya özel analiz geçmişi
 */
app.get('/api/analyses', async (c) => {
  try {
    const userWallet = c.req.query('userWallet');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');
    
    if (!userWallet) {
      return c.json({
        error: 'userWallet query parameter is required',
      }, 400);
    }
    
    console.log(`📊 Fetching analyses for wallet: ${userWallet.substring(0, 10)}...`);
    
    const analyses = await getUserAnalyses(userWallet, limit, offset);
    
    // Get total count for pagination
    // TODO: Implement count query in supabase.ts
    const total = analyses.length; // Simplified for now
    
    return c.json({
      analyses: analyses.map(a => {
        // Parse analysis_report if it's a string
        let parsedReport: any = null;
        try {
          parsedReport = typeof a.analysis_report === 'string' 
            ? JSON.parse(a.analysis_report) 
            : a.analysis_report;
        } catch (e) {
          // If parsing fails, treat as plain text
          parsedReport = { riskAnalysis: a.analysis_report };
        }
        
        return {
          id: a.id,
          poolId: a.pool_id,
          tokenMint: a.token_mint,
          analysisReport: parsedReport,
          riskScore: a.risk_score || parsedReport?.riskScore || null,
          generatedAt: a.generated_at,
          userId: a.user_id,
        };
      }),
      total,
      limit,
      offset,
    });
    
  } catch (error: any) {
    console.error('❌ /api/analyses error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /api/weekly-limit
 * Kullanıcının haftalık limit durumunu kontrol et
 */
app.post('/api/weekly-limit', async (c) => {
  try {
    const body = await c.req.json();
    const { userWallet } = body;
    
    if (!userWallet) {
      return c.json({
        error: 'userWallet is required',
      }, 400);
    }
    
    console.log(`📊 Checking weekly limit for wallet: ${userWallet.substring(0, 10)}...`);
    
    const status = await getWeeklyLimitStatus();
    
    return c.json({
      current: status.current,
      limit: status.limit,
      remaining: status.remaining,
      resetsIn: status.resetsIn,
      resetsAt: status.resetsAt,
      allowed: status.remaining > 0,
    });
    
  } catch (error: any) {
    console.error('❌ /api/weekly-limit error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /api/free-ticket
 * Issue a free ticket to a user (for failed analyses after payment)
 */
app.post('/api/free-ticket', async (c) => {
  try {
    const body = await c.req.json();
    const { userWallet, reason, metadata } = body;
    
    if (!userWallet || !reason) {
      return c.json({
        error: 'userWallet and reason are required',
      }, 400);
    }
    
    console.log(`🎫 Issuing free ticket to wallet: ${userWallet.substring(0, 10)}... (reason: ${reason})`);
    
    const { issueFreeTicket } = await import('./lib/free-tickets');
    await issueFreeTicket(userWallet, reason, metadata);
    
    return c.json({
      success: true,
      message: 'Free ticket issued successfully',
    });
    
  } catch (error: any) {
    console.error('❌ /api/free-ticket error:', error.message);
    return c.json({
      error: 'Internal server error',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /api/free-ticket
 * Check if user has a free ticket
 */
app.get('/api/free-ticket', async (c) => {
  try {
    const userWallet = c.req.query('userWallet');
    
    if (!userWallet) {
      return c.json({
        error: 'userWallet query parameter is required',
      }, 400);
    }
    
    const { checkFreeTicket } = await import('./lib/free-tickets');
    const ticket = await checkFreeTicket(userWallet);
    
    return c.json({
      hasTicket: !!ticket,
      ticket: ticket || null,
    });
    
  } catch (error: any) {
    console.error('❌ /api/free-ticket error:', error.message);
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
    birdeye: 'unknown',
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
    // Birdeye health (simple validation)
    const birdeyeClient = new BirdeyeClient();
    checks.birdeye = 'ok';
  } catch (error) {
    checks.birdeye = 'error';
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
      'POST /api/analyze': 'Submit analysis (alias)',
      'GET /status/:jobId': 'Check job status',
      'GET /api/status/:jobId': 'Check job status (alias)',
      'GET /analysis/:poolId': 'Get analysis result',
      'POST /api/weekly-limit': 'Check weekly limit status',
      'GET /api/analyses': 'Get user analysis history',
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

