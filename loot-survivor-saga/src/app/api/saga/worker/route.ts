// src/app/api/saga/worker/route.ts
// Worker endpoint - Saga generation işlerini işler

import { NextRequest, NextResponse } from 'next/server';
import { createSagaWorker } from '@/lib/queue/saga-queue';

// Worker'ı başlat (Sadece bir kez)
let worker: ReturnType<typeof createSagaWorker> | null = null;

export async function POST(req: NextRequest) {
  try {
    // Worker zaten çalışıyorsa yeniden başlatma
    if (worker) {
      return NextResponse.json({ message: 'Worker already running' });
    }

    // Worker'ı başlat
    worker = createSagaWorker();

    // Event listeners
    worker.on('completed', (job) => {
      console.log(`[Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    return NextResponse.json({ message: 'Worker started successfully' });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// GET: Worker durumu
export async function GET() {
  return NextResponse.json({
    running: worker !== null
  });
}








