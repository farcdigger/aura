/**
 * Rate Limiter Middleware
 * 
 * Günlük analiz limiti ve concurrent job limiti kontrolü
 */

import { Context, Next } from 'hono';
import { redis } from '../lib/cache';
import { Queue } from 'bullmq';

const DAILY_ANALYSIS_LIMIT = parseInt(process.env.DAILY_ANALYSIS_LIMIT || '160', 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10);
const QUEUE_MAX_SIZE = parseInt(process.env.QUEUE_MAX_SIZE || '30', 10);

/**
 * Get current daily analysis count
 */
export async function getDailyCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `daily_analysis_count:${today}`;
  
  const count = await redis.get(key);
  return count ? parseInt(count) : 0;
}

/**
 * Increment daily analysis count
 */
export async function incrementDailyCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = `daily_analysis_count:${today}`;
  
  const newCount = await redis.incr(key);
  
  // Set TTL to expire at midnight (24 hours from now)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const ttl = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
  
  await redis.expire(key, ttl);
  
  return newCount;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queue: Queue): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active,
  };
}

/**
 * Calculate estimated wait time
 */
export function calculateEstimatedWaitTime(queuePosition: number): {
  minutes: number;
  text: string;
} {
  // Her analiz ortalama 60-90 saniye sürüyor
  const avgTimePerAnalysis = 75; // saniye
  const totalSeconds = queuePosition * avgTimePerAnalysis;
  const minutes = Math.ceil(totalSeconds / 60);
  
  if (minutes <= 1) {
    return { minutes: 1, text: '1 dakikadan az' };
  } else if (minutes <= 5) {
    return { minutes, text: `${minutes} dakika` };
  } else {
    return { minutes, text: `${minutes} dakika (${Math.floor(minutes / 5) * 5}-${Math.ceil(minutes / 5) * 5} dakika arası)` };
  }
}

/**
 * IP-based rate limiting (prevent URL spam)
 */
async function checkIPRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ip_rate_limit:${ip}`;
  const maxRequestsPerMinute = 5; // Max 5 requests per minute per IP
  
  try {
    const count = await redis.incr(key);
    
    // Set TTL to 60 seconds if first request
    if (count === 1) {
      await redis.expire(key, 60);
    }
    
    const remaining = Math.max(0, maxRequestsPerMinute - count);
    return {
      allowed: count <= maxRequestsPerMinute,
      remaining,
    };
  } catch (error: any) {
    console.error('[RateLimiter] IP rate limit error:', error.message);
    // Fail-open: allow request if Redis fails
    return { allowed: true, remaining: maxRequestsPerMinute };
  }
}

/**
 * Rate limiter middleware for analysis endpoint
 */
export function analysisRateLimiter(queue: Queue) {
  return async (c: Context, next: Next) => {
    try {
      // 0. IP-based rate limiting (prevent URL spam)
      const clientIP = c.req.header('cf-connecting-ip') || 
                      c.req.header('x-forwarded-for')?.split(',')[0] || 
                      c.req.header('x-real-ip') || 
                      'unknown';
      
      const ipRateLimit = await checkIPRateLimit(clientIP);
      if (!ipRateLimit.allowed) {
        return c.json({
          error: 'rate_limit_exceeded',
          message: 'Çok fazla istek gönderdiniz. Lütfen bir dakika bekleyin.',
          details: {
            remaining: ipRateLimit.remaining,
            resetIn: '60 seconds',
          },
        }, 429);
      }
      
      // 1. Get current daily count
      const dailyCount = await getDailyCount();
      const dailyRemaining = DAILY_ANALYSIS_LIMIT - dailyCount;
      
      // 2. Get queue stats
      const queueStats = await getQueueStats(queue);
      const totalInProgress = queueStats.waiting + queueStats.active;
      
      // 3. Akıllı limit kontrolü: Kuyruk + günlük limit
      if (dailyRemaining <= 0) {
        // Günlük limit tamamen dolmuş
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const hoursUntilReset = Math.ceil((tomorrow.getTime() - Date.now()) / (1000 * 60 * 60));
        
        return c.json({
          error: 'daily_limit_reached',
          message: 'Günlük analiz limiti doldu. Lütfen yarın tekrar deneyin.',
          details: {
            dailyLimit: DAILY_ANALYSIS_LIMIT,
            dailyUsed: dailyCount,
            dailyRemaining: 0,
            resetTime: tomorrow.toISOString(),
            hoursUntilReset,
          },
        }, 429);
      }
      
      // 4. Kuyruk kontrolü: Mevcut queue + yeni istek > günlük limit mi?
      if (totalInProgress >= dailyRemaining) {
        // Kuyruk dolacak, yeni istek alamıyoruz
        return c.json({
          error: 'queue_full_for_today',
          message: `Kalan günlük limit (${dailyRemaining}) dolmak üzere. Şu anda ${totalInProgress} analiz işleniyor/bekliyor.`,
          details: {
            dailyLimit: DAILY_ANALYSIS_LIMIT,
            dailyUsed: dailyCount,
            dailyRemaining,
            queuePosition: totalInProgress,
            activeJobs: queueStats.active,
            waitingJobs: queueStats.waiting,
          },
        }, 429);
      }
      
      // 5. Queue capacity kontrolü
      if (totalInProgress >= QUEUE_MAX_SIZE) {
        return c.json({
          error: 'queue_capacity_full',
          message: `Sistem kapasitesi dolu. Lütfen ${calculateEstimatedWaitTime(QUEUE_MAX_SIZE - MAX_CONCURRENT_JOBS).text} sonra tekrar deneyin.`,
          details: {
            queueMaxSize: QUEUE_MAX_SIZE,
            currentQueue: totalInProgress,
            activeJobs: queueStats.active,
            waitingJobs: queueStats.waiting,
          },
        }, 429);
      }
      
      // 6. Everything OK, pass to next middleware
      await next();
      
    } catch (error: any) {
      console.error('[RateLimiter] Error:', error);
      return c.json({
        error: 'rate_limiter_error',
        message: 'Limit kontrolü sırasında bir hata oluştu',
      }, 500);
    }
  };
}

/**
 * Get current system status (for public endpoint)
 */
export async function getSystemStatus(queue: Queue): Promise<{
  status: 'available' | 'busy' | 'almost_full' | 'daily_limit_reached';
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  activeJobs: number;
  waitingJobs: number;
  queueCapacity: number;
  canAcceptNewJobs: boolean;
  estimatedWaitTime?: string;
}> {
  const dailyCount = await getDailyCount();
  const dailyRemaining = DAILY_ANALYSIS_LIMIT - dailyCount;
  const queueStats = await getQueueStats(queue);
  const totalInProgress = queueStats.waiting + queueStats.active;
  
  let status: 'available' | 'busy' | 'almost_full' | 'daily_limit_reached' = 'available';
  let canAcceptNewJobs = true;
  let estimatedWaitTime: string | undefined;
  
  if (dailyRemaining <= 0) {
    status = 'daily_limit_reached';
    canAcceptNewJobs = false;
  } else if (totalInProgress >= dailyRemaining) {
    status = 'daily_limit_reached';
    canAcceptNewJobs = false;
  } else if (totalInProgress >= QUEUE_MAX_SIZE) {
    status = 'almost_full';
    canAcceptNewJobs = false;
  } else if (queueStats.active >= MAX_CONCURRENT_JOBS && queueStats.waiting > 0) {
    status = 'busy';
    estimatedWaitTime = calculateEstimatedWaitTime(queueStats.waiting + 1).text;
  }
  
  return {
    status,
    dailyLimit: DAILY_ANALYSIS_LIMIT,
    dailyUsed: dailyCount,
    dailyRemaining,
    activeJobs: queueStats.active,
    waitingJobs: queueStats.waiting,
    queueCapacity: QUEUE_MAX_SIZE,
    canAcceptNewJobs,
    estimatedWaitTime,
  };
}

