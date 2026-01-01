// apps/web/app/api/saga/process/route.ts
// Manual worker trigger endpoint - processes one job from the queue
// This endpoint can be called periodically to process jobs in Vercel serverless environment

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // Import queue and worker
    const { sagaQueue, getOrCreateWorker } = await import('@/lib/saga/queue/saga-queue');
    
    // Get waiting jobs
    const waitingJobs = await sagaQueue.getJobs(['waiting']);
    const activeJobs = await sagaQueue.getJobs(['active']);
    
    console.log(`[Process] Queue status: ${waitingJobs.length} waiting, ${activeJobs.length} active`);
    
    // If no waiting jobs, return
    if (waitingJobs.length === 0) {
      return NextResponse.json({
        message: 'No jobs to process',
        waiting: waitingJobs.length,
        active: activeJobs.length
      });
    }
    
    // Initialize worker (this will start processing jobs)
    console.log('[Process] 🔧 Initializing worker...');
    const worker = getOrCreateWorker();
    
    // In Vercel serverless, we need to explicitly run the worker
    // The worker will process jobs asynchronously
    worker.run();
    
    // Wait a bit for worker to pick up the job
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if job was picked up (using getJobs with state filters, not job.state property)
    const afterWaitingJobs = await sagaQueue.getJobs(['waiting']);
    const afterActiveJobs = await sagaQueue.getJobs(['active']);
    console.log(`[Process] After worker init: ${afterWaitingJobs.length} waiting, ${afterActiveJobs.length} active`);
    
    return NextResponse.json({
      message: 'Worker initialized, job processing started',
      waiting: waitingJobs.length,
      active: activeJobs.length,
      afterWaiting: afterWaitingJobs.length,
      afterActive: afterActiveJobs.length
    });
  } catch (error: any) {
    console.error('[Process] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint for easy testing
export async function GET() {
  try {
    const { sagaQueue } = await import('@/lib/saga/queue/saga-queue');
    
    const waitingJobs = await sagaQueue.getJobs(['waiting']);
    const activeJobs = await sagaQueue.getJobs(['active']);
    const completedJobs = await sagaQueue.getJobs(['completed'], 0, 10);
    const failedJobs = await sagaQueue.getJobs(['failed'], 0, 10);
    
    return NextResponse.json({
      queue: {
        waiting: waitingJobs.length,
        active: activeJobs.length,
        completed: completedJobs.length,
        failed: failedJobs.length
      },
      waitingJobs: waitingJobs.map(j => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade
      })),
      activeJobs: activeJobs.map(j => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade,
        progress: j.progress
      }))
    });
  } catch (error: any) {
    console.error('[Process] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

