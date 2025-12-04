import Redis from 'ioredis';
import type { AnalysisResult } from './types';

// =============================================================================
// REDIS CLIENT CONFIGURATION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '300'); // 5 minutes default
const KEY_PREFIX = 'solana-liquidity:';

if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

// =============================================================================
// REDIS CLIENT INITIALIZATION
// =============================================================================

let redisInstance: Redis | null = null;

/**
 * Get or create Redis client singleton
 * Configured for both local development and Upstash production
 */
export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ compatibility
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisInstance.on('connect', () => {
      console.log('[Redis] ✅ Connected to Redis');
      console.log(`[Redis]    URL: ${REDIS_URL.replace(/:[^:]*@/, ':***@')}`); // Hide password
      console.log(`[Redis]    Cache TTL: ${CACHE_TTL_SECONDS} seconds`);
    });

    redisInstance.on('error', (err) => {
      console.error('[Redis] ❌ Connection error:', err.message);
    });

    redisInstance.on('ready', () => {
      console.log('[Redis] 🎯 Ready to accept commands');
    });
  }

  return redisInstance;
}

// Export singleton
export const redis = getRedisClient();

// =============================================================================
// CACHE KEY HELPERS
// =============================================================================

/**
 * Generate cache key for analysis
 */
function getAnalysisCacheKey(poolId: string): string {
  return `${KEY_PREFIX}analysis:${poolId}`;
}

/**
 * Generate cache key for job status
 */
function getJobStatusCacheKey(jobId: string): string {
  return `${KEY_PREFIX}job:${jobId}`;
}

// =============================================================================
// ANALYSIS CACHE OPERATIONS
// =============================================================================

/**
 * Helper function to serialize BigInt values in objects
 * Recursively converts all BigInt values to strings
 */
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  
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
}

/**
 * Get cached analysis for a pool
 * @param poolId Pool address
 * @returns Cached analysis or null
 */
export async function getCachedAnalysis(poolId: string): Promise<AnalysisResult | null> {
  try {
    const key = getAnalysisCacheKey(poolId);
    const cached = await redis.get(key);

    if (!cached) {
      console.log(`[Cache] ❌ Cache miss for pool: ${poolId}`);
      return null;
    }

    console.log(`[Cache] ✅ Cache hit for pool: ${poolId}`);
    return JSON.parse(cached) as AnalysisResult;

  } catch (error: any) {
    console.error('[Cache] ❌ Error getting cached analysis:', error.message);
    return null;
  }
}

/**
 * Set cached analysis for a pool
 * @param poolId Pool address
 * @param analysis Analysis result
 * @param ttlSeconds TTL in seconds (default: from env)
 */
export async function setCachedAnalysis(
  poolId: string,
  analysis: AnalysisResult,
  ttlSeconds: number = CACHE_TTL_SECONDS
): Promise<void> {
  try {
    const key = getAnalysisCacheKey(poolId);
    
    // Serialize BigInt values before caching
    const serializedAnalysis = serializeBigInt(analysis);
    const value = JSON.stringify(serializedAnalysis);

    await redis.setex(key, ttlSeconds, value);

    console.log(`[Cache] ✅ Cached analysis for pool: ${poolId} (TTL: ${ttlSeconds}s)`);

  } catch (error: any) {
    console.error('[Cache] ❌ Error setting cached analysis:', error.message);
  }
}

/**
 * Delete cached analysis for a pool
 * @param poolId Pool address
 */
export async function deleteCachedAnalysis(poolId: string): Promise<void> {
  try {
    const key = getAnalysisCacheKey(poolId);
    await redis.del(key);

    console.log(`[Cache] 🗑️ Deleted cache for pool: ${poolId}`);

  } catch (error: any) {
    console.error('[Cache] ❌ Error deleting cached analysis:', error.message);
  }
}

/**
 * Check if analysis is cached
 * @param poolId Pool address
 * @returns True if cached
 */
export async function isCached(poolId: string): Promise<boolean> {
  try {
    const key = getAnalysisCacheKey(poolId);
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error: any) {
    console.error('[Cache] ❌ Error checking cache:', error.message);
    return false;
  }
}

/**
 * Get remaining TTL for cached analysis
 * @param poolId Pool address
 * @returns Remaining seconds or -1 if not cached
 */
export async function getCacheTTL(poolId: string): Promise<number> {
  try {
    const key = getAnalysisCacheKey(poolId);
    return await redis.ttl(key);
  } catch (error: any) {
    console.error('[Cache] ❌ Error getting TTL:', error.message);
    return -1;
  }
}

// =============================================================================
// JOB STATUS CACHE (Temporary storage for quick status checks)
// =============================================================================

/**
 * Cache job status for quick polling
 * @param jobId Job ID
 * @param status Job status data
 * @param ttlSeconds TTL in seconds (default: 1 hour)
 */
export async function cacheJobStatus(
  jobId: string,
  status: any,
  ttlSeconds: number = 3600
): Promise<void> {
  try {
    const key = getJobStatusCacheKey(jobId);
    const value = JSON.stringify(status);

    await redis.setex(key, ttlSeconds, value);

    console.log(`[Cache] ✅ Cached job status: ${jobId}`);

  } catch (error: any) {
    console.error('[Cache] ❌ Error caching job status:', error.message);
  }
}

/**
 * Get cached job status
 * @param jobId Job ID
 * @returns Job status or null
 */
export async function getCachedJobStatus(jobId: string): Promise<any | null> {
  try {
    const key = getJobStatusCacheKey(jobId);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);

  } catch (error: any) {
    console.error('[Cache] ❌ Error getting cached job status:', error.message);
    return null;
  }
}

// =============================================================================
// GENERAL CACHE OPERATIONS
// =============================================================================

/**
 * Set a generic cache value
 * @param key Cache key (will be prefixed)
 * @param value Value to cache
 * @param ttlSeconds TTL in seconds
 */
export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    await redis.setex(prefixedKey, ttlSeconds, stringValue);

    console.log(`[Cache] ✅ Set cache: ${key} (TTL: ${ttlSeconds}s)`);

  } catch (error: any) {
    console.error('[Cache] ❌ Error setting cache:', error.message);
  }
}

/**
 * Get a generic cache value
 * @param key Cache key (will be prefixed)
 * @param parseJson Whether to parse as JSON
 * @returns Cached value or null
 */
export async function getCache<T = any>(key: string, parseJson: boolean = true): Promise<T | null> {
  try {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    const cached = await redis.get(prefixedKey);

    if (!cached) {
      return null;
    }

    return parseJson ? JSON.parse(cached) : (cached as any);

  } catch (error: any) {
    console.error('[Cache] ❌ Error getting cache:', error.message);
    return null;
  }
}

/**
 * Delete a cache key
 * @param key Cache key (will be prefixed)
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    await redis.del(prefixedKey);

    console.log(`[Cache] 🗑️ Deleted cache: ${key}`);

  } catch (error: any) {
    console.error('[Cache] ❌ Error deleting cache:', error.message);
  }
}

// =============================================================================
// CACHE STATISTICS
// =============================================================================

/**
 * Get cache statistics
 * @returns Cache stats
 */
export async function getCacheStats(): Promise<{
  analysisKeys: number;
  jobKeys: number;
  totalKeys: number;
  memoryUsed: string;
}> {
  try {
    const analysisPattern = `${KEY_PREFIX}analysis:*`;
    const jobPattern = `${KEY_PREFIX}job:*`;
    const allPattern = `${KEY_PREFIX}*`;

    // Note: SCAN is better for production than KEYS
    const analysisKeys = await redis.keys(analysisPattern);
    const jobKeys = await redis.keys(jobPattern);
    const allKeys = await redis.keys(allPattern);

    // Get memory info
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsed = memoryMatch && memoryMatch[1] ? memoryMatch[1].trim() : 'unknown';

    return {
      analysisKeys: analysisKeys.length,
      jobKeys: jobKeys.length,
      totalKeys: allKeys.length,
      memoryUsed,
    };

  } catch (error: any) {
    console.error('[Cache] ❌ Error getting stats:', error.message);
    return {
      analysisKeys: 0,
      jobKeys: 0,
      totalKeys: 0,
      memoryUsed: 'unknown',
    };
  }
}

/**
 * Clear all analysis cache (use with caution!)
 */
export async function clearAnalysisCache(): Promise<number> {
  try {
    const pattern = `${KEY_PREFIX}analysis:*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      console.log('[Cache] ℹ️ No analysis cache to clear');
      return 0;
    }

    await redis.del(...keys);
    console.log(`[Cache] 🗑️ Cleared ${keys.length} analysis cache entries`);

    return keys.length;

  } catch (error: any) {
    console.error('[Cache] ❌ Error clearing cache:', error.message);
    return 0;
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check Redis connection health
 * @returns True if healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    
    if (pong === 'PONG') {
      console.log('[Cache] ✅ Health check OK');
      return true;
    }

    console.error('[Cache] ❌ Health check failed: unexpected response');
    return false;

  } catch (error: any) {
    console.error('[Cache] ❌ Health check error:', error.message);
    return false;
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    console.log('[Cache] 👋 Redis connection closed');
    redisInstance = null;
  }
}

