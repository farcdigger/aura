// apps/web/app/api/saga/generate/route.ts
// Direct implementation - copied from loot-survivor-saga
// This avoids the proxy loop issue in production

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Import saga dependencies - we'll need to copy these lib files too
// For now, let's use dynamic imports to avoid build issues
export async function POST(req: NextRequest) {
  try {
    // Redis URL kontrolü (Vercel'de gerekli)
    if (!process.env.UPSTASH_REDIS_URL && !process.env.REDIS_URL) {
      console.error('[Saga Generate] ❌ Redis URL not configured!');
      return NextResponse.json(
        { 
          error: 'Redis URL not configured. Please set UPSTASH_REDIS_URL or REDIS_URL in Vercel environment variables. For Vercel deployment, you need an Upstash Redis instance (localhost Redis does not work on Vercel).' 
        },
        { status: 500 }
      );
    }
    
    // Import saga dependencies
    const { sagaQueue } = await import('@/lib/saga/queue/saga-queue');
    const { cleanupQueue } = await import('@/lib/saga/queue/queue-cleanup');
    const { supabase } = await import('@/lib/saga/database/supabase');
    const { fetchGameData } = await import('@/lib/saga/blockchain/bibliotheca');
    
    // ÖNCE: Queue'yu temizle (her saga generate'den önce)
    console.log('[Saga Generate] 🧹 Cleaning queue before saga generation...');
    try {
      const cleanupResult = await cleanupQueue();
      console.log('[Saga Generate] ✅ Queue cleaned:', cleanupResult);
    } catch (cleanupError: any) {
      console.warn('[Saga Generate] ⚠️ Queue cleanup failed (continuing anyway):', cleanupError.message);
      // Cleanup hatası saga generation'ı durdurmamalı
    }
    
    let { gameId } = await req.json();

    // Validasyon
    if (!gameId) {
      return NextResponse.json(
        { error: 'Missing gameId' },
        { status: 400 }
      );
    }

    // Game ID formatını temizle (# işareti ve "ID:" prefix'ini kaldır)
    gameId = String(gameId)
      .trim()
      .replace(/^ID:\s*/i, '') // "ID: " prefix'ini kaldır
      .replace(/^#/, '') // "#" işaretini kaldır
      .trim();

    // Önce game data'yı çek (wallet adresini almak için)
    let gameData;
    try {
      console.log(`[Saga Generate] Fetching game data for ID: ${gameId}`);
      gameData = await fetchGameData(gameId);
      console.log(`[Saga Generate] Game data fetched:`, {
        id: gameData.adventurer.id,
        hasOwner: !!gameData.adventurer.owner,
        hasName: !!gameData.adventurer.name,
        level: gameData.adventurer.level,
        xp: gameData.adventurer.xp
      });
    } catch (error: any) {
      console.error(`[Saga Generate] Failed to fetch game data:`, error);
      return NextResponse.json(
        { error: `Game not found: ${error.message}` },
        { status: 404 }
      );
    }

    // Owner boşsa (packed data decode edilmediyse) geçici çözüm
    let userWallet = gameData.adventurer.owner?.toLowerCase();
    if (!userWallet || userWallet === '') {
      console.warn(`[Saga Generate] Owner is empty for game ${gameId}. Using game ID as fallback.`);
      // Geçici çözüm: Game ID'yi wallet olarak kullan (sadece test için)
      // TODO: Packed data decode implementasyonu
      userWallet = `unknown_${gameId}`.toLowerCase();
    }

    // ÖNCE: Game'i games tablosuna kaydet (Foreign key constraint için)
    const gameRecord = {
      id: gameId,
      user_wallet: userWallet,
      adventurer_name: gameData.adventurer.name,
      level: gameData.adventurer.level,
      total_turns: gameData.logs.length,
      final_score: gameData.adventurer.xp,
      is_dead: gameData.adventurer.health === 0,
      raw_data: { adventurer: gameData.adventurer, logs: gameData.logs },
      fetched_at: new Date().toISOString()
    };

    const { error: gameInsertError } = await supabase
      .from('games')
      .upsert(gameRecord, { onConflict: 'id' });

    if (gameInsertError) {
      console.error('[Saga Generate] Failed to upsert game:', gameInsertError);
      return NextResponse.json(
        { error: `Failed to save game: ${gameInsertError.message}` },
        { status: 500 }
      );
    }

    console.log('[Saga Generate] ✅ Game saved to database');

    // Allow multiple sagas for the same game ID - users can generate different versions
    console.log('[Saga Generate] ✅ Creating new saga (multiple sagas per game allowed)...');

    // Yeni saga kaydı oluştur (UUID format - Supabase schema'ya uygun)
    const sagaId = randomUUID();
    const { data: insertedSaga, error: insertError } = await supabase
      .from('sagas')
      .insert({
        id: sagaId,
        game_id: gameId,
        user_wallet: userWallet,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Saga Generate] Failed to insert saga:', insertError);
      return NextResponse.json(
        { error: `Failed to create saga: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[Saga Generate] ✅ Saga created:', { sagaId, gameId, userWallet });

    // Worker'ı önce başlat (job eklemeden önce - önemli!)
    // Not: Production'da worker ayrı process'te çalışmalı
    console.log('[Saga Generate] 🔧 Initializing worker...');
    try {
      const { getOrCreateWorker } = await import('@/lib/saga/queue/saga-queue');
      const worker = getOrCreateWorker();
      
      // Worker'ın ready olmasını bekle (max 3 saniye)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('[Saga Generate] ⚠️ Worker ready timeout, continuing anyway...');
          resolve(); // Timeout'ta bile devam et (Worker zaten başlatıldı)
        }, 3000);
        
        worker.once('ready', () => {
          clearTimeout(timeout);
          console.log('[Saga Generate] ✅ Worker ready');
          resolve();
        });
        
        // Worker zaten ready ise hemen resolve et
        // (Worker'ın ready event'i zaten tetiklenmiş olabilir)
        setTimeout(() => {
          if (worker.isRunning && worker.isRunning()) {
            clearTimeout(timeout);
            console.log('[Saga Generate] ✅ Worker is already running');
            resolve();
          }
        }, 100);
      });
    } catch (error: any) {
      console.error('[Saga Generate] ❌ Worker initialization error:', error);
      // Worker hatası job'u durdurmamalı, sadece log'la
      console.warn('[Saga Generate] ⚠️ Continuing without waiting for worker ready...');
    }

    // Queue'ya ekle
    console.log('[Saga Generate] 📤 Adding job to queue...');
    let job;
    try {
      job = await sagaQueue.add('generate-saga', {
        sagaId,
        gameId,
        userWallet
      }, {
        jobId: sagaId, // Saga ID = Job ID (kolay takip için)
        removeOnComplete: {
          count: 100, // Son 100 başarılı job'u sakla
          age: 24 * 3600 // 24 saat
        },
        removeOnFail: {
          count: 50
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      console.log('[Saga Generate] ✅ Job added to queue:', job.id);
      
      // Job'u ekledikten sonra queue durumunu kontrol et
      const waitingJobs = await sagaQueue.getJobs(['waiting']);
      const activeJobs = await sagaQueue.getJobs(['active']);
      console.log(`[Saga Generate] 📊 Queue status: ${waitingJobs.length} waiting, ${activeJobs.length} active`);
      
      // Worker'ın job'u almasını bekle (max 2 saniye)
      await new Promise(resolve => setTimeout(resolve, 2000));
      const afterJobs = await sagaQueue.getJobs(['waiting', 'active']);
      console.log(`[Saga Generate] 📊 After 2s: ${afterJobs.length} jobs in queue`);
      console.log('[Saga Generate] Job details:', {
        jobId: job.id,
        sagaId,
        gameId,
        name: job.name,
        queueName: sagaQueue.name
      });
    } catch (queueError: any) {
      console.error('[Saga Generate] ❌ Failed to add job to queue:', queueError);
      // Job eklenemezse saga'yı failed olarak işaretle
      await supabase
        .from('sagas')
        .update({ status: 'failed' })
        .eq('id', sagaId);
      throw new Error(`Failed to add job to queue: ${queueError.message}`);
    }

    return NextResponse.json({
      sagaId,
      jobId: job.id,
      status: 'queued',
      message: 'Saga generation started'
    });

  } catch (error: any) {
    console.error('Saga generation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

