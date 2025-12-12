import { Queue, Job, QueueEvents } from 'bullmq';
import { redis } from './cache';
import type { QueueJobData, JobStatusResponse } from './types';

// =============================================================================
// QUEUE CONFIGURATION
// =============================================================================

const QUEUE_NAME = 'pool-analysis';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');
const MAX_ATTEMPTS = parseInt(process.env.WORKER_MAX_ATTEMPTS || '1'); // ✅ Retry KAPALI: Her retry'da veri çekiliyor, limit bitiyor
const BACKOFF_DELAY_MS = parseInt(process.env.WORKER_BACKOFF_DELAY_MS || '5000');

// =============================================================================
// QUEUE INSTANCE
// =============================================================================

let analysisQueueInstance: Queue | null = null;

/**
 * Get or create analysis queue singleton
 */
export function getAnalysisQueue(): Queue {
  if (!analysisQueueInstance) {
    analysisQueueInstance = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        // Retry configuration
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: BACKOFF_DELAY_MS,
        },
        
        // Job retention
        removeOnComplete: {
          count: 100, // Keep last 100 successful jobs
          age: 24 * 3600, // Keep for 24 hours
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
          age: 7 * 24 * 3600, // Keep for 7 days
        },
      },
    });

    console.log('[Queue] ✅ Analysis queue initialized');
    console.log(`[Queue]    Name: ${QUEUE_NAME}`);
    console.log(`[Queue]    Concurrency: ${WORKER_CONCURRENCY}`);
    console.log(`[Queue]    Max Attempts: ${MAX_ATTEMPTS}`);
  }

  return analysisQueueInstance;
}

// Export singleton
export const analysisQueue = getAnalysisQueue();

// Also export as 'queue' for convenience
export const queue = analysisQueue;

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

const MAX_QUEUE_SIZE = 5; // Maximum number of jobs in queue (waiting + active)

/**
 * Add analysis job to queue
 * @param data Job data (poolId, userId, options)
 * @returns Job instance
 * @throws Error if queue is full (max 5 jobs)
 */
export async function addAnalysisJob(data: QueueJobData) {
  try {
    // Check queue size before adding
    const stats = await getQueueStats();
    const currentQueueSize = stats.waiting + stats.active;
    
    if (currentQueueSize >= MAX_QUEUE_SIZE) {
      throw new Error(`Queue is full. Maximum ${MAX_QUEUE_SIZE} jobs allowed (currently ${currentQueueSize}). Please try again later.`);
    }

    const jobData: QueueJobData = {
      ...data,
      requestedAt: data.requestedAt || new Date().toISOString(),
    };

    const job = await analysisQueue.add(
      'analyze-pool',
      jobData,
      {
        jobId: `${jobData.poolId}-${Date.now()}`, // Unique job ID
        priority: data.priority || 0,
      }
    );

    console.log(`[Queue] ✅ Job added: ${job.id} (Pool: ${jobData.poolId})`);
    console.log(`[Queue] 📊 Queue status: ${currentQueueSize + 1}/${MAX_QUEUE_SIZE} (waiting: ${stats.waiting + 1}, active: ${stats.active})`);

    return job;

  } catch (error: any) {
    console.error('[Queue] ❌ Error adding job:', error.message);
    throw error;
  }
}

/**
 * Get job status
 * @param jobId Job ID
 * @returns Job status information
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
  try {
    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress as number | undefined;
    const returnvalue = job.returnvalue;
    const failedReason = job.failedReason;

    // Map BullMQ states to our status types
    const statusMap: Record<string, JobStatusResponse['status']> = {
      'waiting': 'waiting',
      'active': 'active',
      'completed': 'completed',
      'failed': 'failed',
      'delayed': 'delayed',
    };

    const status = statusMap[state] || 'waiting';

    // Extract recordId from returnvalue if available
    const result = status === 'completed' ? returnvalue : undefined;
    const recordId = result && typeof result === 'object' && 'recordId' in result 
      ? result.recordId 
      : undefined;
    
    const response: JobStatusResponse = {
      jobId,
      status,
      progress,
      result: result ? {
        ...(typeof result === 'object' ? result : {}),
        recordId, // Ensure recordId is included
      } : undefined,
      error: status === 'failed' ? failedReason : undefined,
      metadata: {
        attempts: job.attemptsMade,
        processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
        completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      },
    };

    return response;

  } catch (error: any) {
    console.error('[Queue] ❌ Error getting job status:', error.message);
    return null;
  }
}

/**
 * Cancel/remove a job
 * @param jobId Job ID
 * @returns True if successful
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      console.log(`[Queue] ℹ️ Job not found: ${jobId}`);
      return false;
    }

    await job.remove();
    console.log(`[Queue] 🗑️ Job cancelled: ${jobId}`);

    return true;

  } catch (error: any) {
    console.error('[Queue] ❌ Error cancelling job:', error.message);
    return false;
  }
}

// =============================================================================
// QUEUE STATISTICS
// =============================================================================

/**
 * Get queue statistics
 * @returns Queue stats
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}> {
  try {
    const counts = await analysisQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed'
    );

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      total,
    };

  } catch (error: any) {
    console.error('[Queue] ❌ Error getting queue stats:', error.message);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
    };
  }
}

/**
 * Get waiting jobs
 * @param start Start index
 * @param end End index
 * @returns Array of waiting jobs
 */
export async function getWaitingJobs(start: number = 0, end: number = 10): Promise<Job<QueueJobData>[]> {
  try {
    return await analysisQueue.getWaiting(start, end);
  } catch (error: any) {
    console.error('[Queue] ❌ Error getting waiting jobs:', error.message);
    return [];
  }
}

/**
 * Get active jobs
 * @param start Start index
 * @param end End index
 * @returns Array of active jobs
 */
export async function getActiveJobs(start: number = 0, end: number = 10): Promise<Job<QueueJobData>[]> {
  try {
    return await analysisQueue.getActive(start, end);
  } catch (error: any) {
    console.error('[Queue] ❌ Error getting active jobs:', error.message);
    return [];
  }
}

/**
 * Get failed jobs
 * @param start Start index
 * @param end End index
 * @returns Array of failed jobs
 */
export async function getFailedJobs(start: number = 0, end: number = 10): Promise<Job<QueueJobData>[]> {
  try {
    return await analysisQueue.getFailed(start, end);
  } catch (error: any) {
    console.error('[Queue] ❌ Error getting failed jobs:', error.message);
    return [];
  }
}

// =============================================================================
// QUEUE MAINTENANCE
// =============================================================================

/**
 * Clean completed jobs older than specified age
 * @param ageInMs Age in milliseconds
 * @returns Number of jobs cleaned
 */
export async function cleanCompletedJobs(ageInMs: number = 24 * 3600 * 1000): Promise<number> {
  try {
    const jobs = await analysisQueue.clean(ageInMs, 0, 'completed');
    console.log(`[Queue] 🧹 Cleaned ${jobs.length} completed jobs`);
    return jobs.length;
  } catch (error: any) {
    console.error('[Queue] ❌ Error cleaning completed jobs:', error.message);
    return 0;
  }
}

/**
 * Clean failed jobs older than specified age
 * @param ageInMs Age in milliseconds
 * @returns Number of jobs cleaned
 */
export async function cleanFailedJobs(ageInMs: number = 7 * 24 * 3600 * 1000): Promise<number> {
  try {
    const jobs = await analysisQueue.clean(ageInMs, 0, 'failed');
    console.log(`[Queue] 🧹 Cleaned ${jobs.length} failed jobs`);
    return jobs.length;
  } catch (error: any) {
    console.error('[Queue] ❌ Error cleaning failed jobs:', error.message);
    return 0;
  }
}

/**
 * Retry all failed jobs
 * @returns Number of jobs retried
 */
export async function retryFailedJobs(): Promise<number> {
  try {
    const failedJobs = await analysisQueue.getFailed();
    let retriedCount = 0;

    for (const job of failedJobs) {
      await job.retry();
      retriedCount++;
    }

    console.log(`[Queue] 🔄 Retried ${retriedCount} failed jobs`);
    return retriedCount;

  } catch (error: any) {
    console.error('[Queue] ❌ Error retrying failed jobs:', error.message);
    return 0;
  }
}

/**
 * Pause the queue (stop processing new jobs)
 */
export async function pauseQueue(): Promise<void> {
  try {
    await analysisQueue.pause();
    console.log('[Queue] ⏸️ Queue paused');
  } catch (error: any) {
    console.error('[Queue] ❌ Error pausing queue:', error.message);
  }
}

/**
 * Resume the queue (start processing jobs again)
 */
export async function resumeQueue(): Promise<void> {
  try {
    await analysisQueue.resume();
    console.log('[Queue] ▶️ Queue resumed');
  } catch (error: any) {
    console.error('[Queue] ❌ Error resuming queue:', error.message);
  }
}

/**
 * Drain the queue (wait for all active jobs to complete)
 */
export async function drainQueue(): Promise<void> {
  try {
    await analysisQueue.drain();
    console.log('[Queue] 💧 Queue drained');
  } catch (error: any) {
    console.error('[Queue] ❌ Error draining queue:', error.message);
  }
}

// =============================================================================
// QUEUE EVENTS (for monitoring)
// =============================================================================

/**
 * Setup queue event listeners
 * @returns QueueEvents instance
 */
export function setupQueueEvents(): QueueEvents {
  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redis,
  });

  queueEvents.on('waiting', ({ jobId }) => {
    console.log(`[Queue Events] 📥 Job waiting: ${jobId}`);
  });

  queueEvents.on('active', ({ jobId }) => {
    console.log(`[Queue Events] ⚡ Job active: ${jobId}`);
  });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`[Queue Events] ✅ Job completed: ${jobId}`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[Queue Events] ❌ Job failed: ${jobId} - ${failedReason}`);
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    console.log(`[Queue Events] 📊 Job progress: ${jobId} - ${data}%`);
  });

  console.log('[Queue Events] 👂 Event listeners registered');

  return queueEvents;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check queue health
 * @returns True if healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    // Try to get queue stats
    const stats = await getQueueStats();
    
    // Check if we got valid stats
    if (typeof stats.total === 'number') {
      console.log('[Queue] ✅ Health check OK');
      console.log(`[Queue]    Total jobs: ${stats.total}`);
      console.log(`[Queue]    Active: ${stats.active}, Waiting: ${stats.waiting}`);
      return true;
    }

    console.error('[Queue] ❌ Health check failed: invalid stats');
    return false;

  } catch (error: any) {
    console.error('[Queue] ❌ Health check error:', error.message);
    return false;
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Close queue connection gracefully
 */
export async function closeQueue(): Promise<void> {
  if (analysisQueueInstance) {
    await analysisQueueInstance.close();
    console.log('[Queue] 👋 Queue closed');
    analysisQueueInstance = null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { QUEUE_NAME, WORKER_CONCURRENCY, MAX_QUEUE_SIZE };

