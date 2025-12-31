// scripts/cleanup-queue.ts
// Clean up old/completed/failed jobs from the queue

// Load .env.local file FIRST (before any imports that need env vars)
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file
const envPath = resolve(process.cwd(), '.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.warn('⚠️  Could not load .env.local:', result.error.message);
  console.warn('   Using system environment variables instead');
} else {
  console.log('✅ Loaded .env.local file');
  if (process.env.UPSTASH_REDIS_URL) {
    console.log('   Redis URL found:', process.env.UPSTASH_REDIS_URL.substring(0, 30) + '...');
  }
}

// Verify environment variable is loaded
if (!process.env.UPSTASH_REDIS_URL && !process.env.REDIS_URL) {
  console.error('❌ ERROR: UPSTASH_REDIS_URL or REDIS_URL not found in environment!');
  console.error('   Make sure .env.local file exists and contains UPSTASH_REDIS_URL');
  process.exit(1);
}

async function cleanupQueue() {
  try {
    // Dynamic import AFTER environment variables are loaded
    const { sagaQueue } = await import('../src/lib/queue/saga-queue');
    
    console.log('🧹 Cleaning up queue...');
    
    // Get all jobs from different states
    const waitingJobs = await sagaQueue.getJobs(['waiting']);
    const activeJobs = await sagaQueue.getJobs(['active']);
    const completedJobs = await sagaQueue.getJobs(['completed']);
    const failedJobs = await sagaQueue.getJobs(['failed']);
    const delayedJobs = await sagaQueue.getJobs(['delayed']);
    
    const allJobs = [...waitingJobs, ...activeJobs, ...completedJobs, ...failedJobs, ...delayedJobs];
    
    console.log(`📊 Found ${allJobs.length} jobs in queue`);
    
    // Group by status
    const byStatus = {
      waiting: waitingJobs,
      active: activeJobs,
      completed: completedJobs,
      failed: failedJobs,
      delayed: delayedJobs
    };
    
    console.log('\n📈 Job status breakdown:');
    console.log(`  Waiting: ${byStatus.waiting.length}`);
    console.log(`  Active: ${byStatus.active.length}`);
    console.log(`  Completed: ${byStatus.completed.length}`);
    console.log(`  Failed: ${byStatus.failed.length}`);
    console.log(`  Delayed: ${byStatus.delayed.length}`);
    
    // Show waiting jobs before cleanup
    if (byStatus.waiting.length > 0) {
      console.log('\n⏳ Waiting jobs (will be removed):');
      for (const job of byStatus.waiting.slice(0, 10)) {
        const sagaId = job.data?.sagaId || 'unknown';
        const gameId = job.data?.gameId || 'unknown';
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sagaId);
        console.log(`  - Job ${job.id}: ${sagaId} (game ${gameId}) ${isUUID ? '✅' : '⚠️ old format'}`);
      }
      if (byStatus.waiting.length > 10) {
        console.log(`  ... and ${byStatus.waiting.length - 10} more`);
      }
    }
    
    let removedCount = 0;
    
    // Remove ALL waiting jobs (eski job'lar genelde waiting'de)
    console.log('\n🗑️  Removing waiting jobs...');
    for (const job of byStatus.waiting) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`  ⚠️  Failed to remove job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL completed jobs
    console.log('🗑️  Removing completed jobs...');
    for (const job of byStatus.completed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`  ⚠️  Failed to remove job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL failed jobs
    console.log('🗑️  Removing failed jobs...');
    for (const job of byStatus.failed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`  ⚠️  Failed to remove job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL delayed jobs
    console.log('🗑️  Removing delayed jobs...');
    for (const job of byStatus.delayed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`  ⚠️  Failed to remove job ${job.id}: ${err.message}`);
      }
    }
    
    // Active jobs'ları da temizle (muhtemelen takılı kalmış)
    if (byStatus.active.length > 0) {
      console.log(`\n🗑️  Removing ${byStatus.active.length} active jobs (may be stuck)...`);
      for (const job of byStatus.active) {
        try {
          // Active job'u önce fail et, sonra remove et
          try {
            await job.moveToFailed(new Error('Manually removed - stuck job'), '0');
            console.log(`  ⚠️  Moved active job to failed: ${job.id}`);
          } catch (err: any) {
            console.warn(`  ⚠️  Could not move job to failed: ${err.message}`);
          }
          await job.remove();
          removedCount++;
          console.log(`  ✅ Removed active job: ${job.id}`);
        } catch (err: any) {
          console.warn(`  ⚠️  Failed to remove active job ${job.id}: ${err.message}`);
        }
      }
    }
    
    console.log(`\n✅ Successfully removed ${removedCount} jobs`);
    console.log(`📊 Remaining active jobs: ${byStatus.active.length}`);
    
    // Clean up the queue (remove old data)
    // Force obliterate to remove locked jobs
    try {
      if (byStatus.active.length > 0) {
        console.log('\n🔓 Force cleaning queue to remove locked jobs...');
        await sagaQueue.obliterate({ force: true });
        console.log('✅ Queue force cleaned successfully (locked jobs removed)');
      } else {
        await sagaQueue.obliterate({ force: false });
        console.log('✅ Queue cleaned successfully');
      }
    } catch (err: any) {
      console.warn('⚠️  Could not obliterate queue:', err.message);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

cleanupQueue();

