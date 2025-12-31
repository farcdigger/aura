// src/lib/queue/queue-cleanup.ts
// Queue cleanup utility function for API routes

import { sagaQueue } from './saga-queue';

export async function cleanupQueue(): Promise<{ removed: number; status: any }> {
  try {
    console.log('[Queue Cleanup] 🧹 Starting queue cleanup...');
    
    // Get all jobs from different states
    const waitingJobs = await sagaQueue.getJobs(['waiting']);
    const activeJobs = await sagaQueue.getJobs(['active']);
    const completedJobs = await sagaQueue.getJobs(['completed']);
    const failedJobs = await sagaQueue.getJobs(['failed']);
    const delayedJobs = await sagaQueue.getJobs(['delayed']);
    
    const byStatus = {
      waiting: waitingJobs,
      active: activeJobs,
      completed: completedJobs,
      failed: failedJobs,
      delayed: delayedJobs
    };
    
    console.log('[Queue Cleanup] 📊 Job status breakdown:', {
      waiting: byStatus.waiting.length,
      active: byStatus.active.length,
      completed: byStatus.completed.length,
      failed: byStatus.failed.length,
      delayed: byStatus.delayed.length
    });
    
    let removedCount = 0;
    
    // Remove ALL waiting jobs
    for (const job of byStatus.waiting) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`[Queue Cleanup] ⚠️ Failed to remove waiting job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL completed jobs
    for (const job of byStatus.completed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`[Queue Cleanup] ⚠️ Failed to remove completed job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL failed jobs
    for (const job of byStatus.failed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`[Queue Cleanup] ⚠️ Failed to remove failed job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL delayed jobs
    for (const job of byStatus.delayed) {
      try {
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`[Queue Cleanup] ⚠️ Failed to remove delayed job ${job.id}: ${err.message}`);
      }
    }
    
    // Remove ALL active jobs (may be stuck)
    for (const job of byStatus.active) {
      try {
        // Try to move to failed first, then remove
        try {
          await job.moveToFailed(new Error('Auto-removed before new saga generation'), '0');
        } catch (err: any) {
          // Ignore if already failed
        }
        await job.remove();
        removedCount++;
      } catch (err: any) {
        console.warn(`[Queue Cleanup] ⚠️ Failed to remove active job ${job.id}: ${err.message}`);
      }
    }
    
    // Clean up the queue (remove old data)
    try {
      if (byStatus.active.length > 0) {
        await sagaQueue.obliterate({ force: true });
        console.log('[Queue Cleanup] ✅ Queue force cleaned (locked jobs removed)');
      } else {
        await sagaQueue.obliterate({ force: false });
        console.log('[Queue Cleanup] ✅ Queue cleaned successfully');
      }
    } catch (err: any) {
      console.warn('[Queue Cleanup] ⚠️ Could not obliterate queue:', err.message);
    }
    
    console.log(`[Queue Cleanup] ✅ Cleanup completed: ${removedCount} jobs removed`);
    
    return {
      removed: removedCount,
      status: {
        waiting: byStatus.waiting.length,
        active: byStatus.active.length,
        completed: byStatus.completed.length,
        failed: byStatus.failed.length,
        delayed: byStatus.delayed.length
      }
    };
  } catch (error: any) {
    console.error('[Queue Cleanup] ❌ Cleanup failed:', error.message);
    throw error;
  }
}

