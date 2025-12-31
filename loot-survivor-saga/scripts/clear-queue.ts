// Clear all jobs from the queue
// Run with: npx tsx scripts/clear-queue.ts

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

const isTLS = redisUrl.startsWith('rediss://');
const connectionOptions: any = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      return null;
    }
    return Math.min(times * 100, 3000);
  },
};

if (isTLS) {
  connectionOptions.tls = {
    rejectUnauthorized: false,
  };
}

const redisConnection = new Redis(redisUrl, connectionOptions);

const sagaQueue = new Queue('saga-generation', {
  connection: redisConnection,
});

async function clearQueue() {
  try {
    console.log('[Clear Queue] Connecting to Redis...');
    await redisConnection.connect();
    console.log('[Clear Queue] ✅ Connected to Redis');

    // Get all jobs
    const waiting = await sagaQueue.getJobs(['waiting']);
    const active = await sagaQueue.getJobs(['active']);
    const completed = await sagaQueue.getJobs(['completed']);
    const failed = await sagaQueue.getJobs(['failed']);
    const delayed = await sagaQueue.getJobs(['delayed']);

    console.log('[Clear Queue] Current queue status:');
    console.log(`  - Waiting: ${waiting.length}`);
    console.log(`  - Active: ${active.length}`);
    console.log(`  - Completed: ${completed.length}`);
    console.log(`  - Failed: ${failed.length}`);
    console.log(`  - Delayed: ${delayed.length}`);

    // Remove all jobs
    if (waiting.length > 0) {
      console.log(`[Clear Queue] Removing ${waiting.length} waiting jobs...`);
      for (const job of waiting) {
        await job.remove();
        console.log(`[Clear Queue] ✅ Removed waiting job: ${job.id}`);
      }
    }

    if (active.length > 0) {
      console.log(`[Clear Queue] Removing ${active.length} active jobs...`);
      for (const job of active) {
        // Active job'u önce fail et, sonra remove et
        try {
          await job.moveToFailed(new Error('Manually removed'), '0');
          console.log(`[Clear Queue] ⚠️ Moved active job to failed: ${job.id}`);
        } catch (err: any) {
          console.warn(`[Clear Queue] ⚠️ Could not move job to failed: ${err.message}`);
        }
        await job.remove();
        console.log(`[Clear Queue] ✅ Removed active job: ${job.id}`);
      }
    }

    if (delayed.length > 0) {
      console.log(`[Clear Queue] Removing ${delayed.length} delayed jobs...`);
      for (const job of delayed) {
        await job.remove();
        console.log(`[Clear Queue] ✅ Removed delayed job: ${job.id}`);
      }
    }

    console.log('[Clear Queue] ✅ Queue cleared!');
    
    // Verify
    const finalWaiting = await sagaQueue.getJobs(['waiting']);
    const finalActive = await sagaQueue.getJobs(['active']);
    console.log('[Clear Queue] Final status:');
    console.log(`  - Waiting: ${finalWaiting.length}`);
    console.log(`  - Active: ${finalActive.length}`);

    await redisConnection.quit();
    process.exit(0);
  } catch (error: any) {
    console.error('[Clear Queue] ❌ Error:', error.message);
    await redisConnection.quit();
    process.exit(1);
  }
}

clearQueue();

