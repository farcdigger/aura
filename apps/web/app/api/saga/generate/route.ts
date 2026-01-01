// apps/web/app/api/saga/generate/route.ts
// Direct implementation - copied from loot-survivor-saga
// This avoids the proxy loop issue in production

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Import saga dependencies - we'll need to copy these lib files too
// For now, let's use dynamic imports to avoid build issues
export async function POST(req: NextRequest) {
  try {
    // Check for x402 payment header (sent by x402-fetch after payment)
    const paymentHeader = req.headers.get("X-PAYMENT");
    
    if (!paymentHeader) {
      // No payment header - return 402 to request payment
      console.log('[Saga Generate] 💳 Payment required - returning 402');
      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [{
            scheme: "exact" as const,
            network: "base",
            maxAmountRequired: "500000", // 0.5 USDC (6 decimals)
            resource: "https://xfroranft.xyz/api/saga/payment",
            description: "Loot Survivor Saga Generation - 0.5 USDC",
            mimeType: "application/json",
            payTo: "0xDA9097c5672928a16C42889cD4b07d9a766827ee",
            maxTimeoutSeconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            extra: {
              name: "USD Coin",
              version: "2"
            }
          }],
        },
        { 
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Required": "true"
          }
        }
      );
    }

    // Parse and verify payment
    let paymentPayload;
    try {
      if (paymentHeader.startsWith('eyJ')) {
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
        paymentPayload = JSON.parse(decoded);
      } else {
        paymentPayload = JSON.parse(paymentHeader);
      }
      console.log('[Saga Generate] ✅ Payment payload parsed');
    } catch (error) {
      console.error('[Saga Generate] ❌ Invalid payment header format:', error);
      return NextResponse.json(
        { error: "Invalid payment header" },
        { status: 400 }
      );
    }

    // Verify payment by calling payment endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const paymentResponse = await fetch(`${baseUrl}/api/saga/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader
      }
    });

    if (!paymentResponse.ok) {
      console.error('[Saga Generate] ❌ Payment verification failed');
      const errorData = await paymentResponse.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: "Payment verification failed", 
          reason: errorData.reason || 'Unknown error'
        },
        { status: 402 }
      );
    }

    const paymentData = await paymentResponse.json();
    console.log('[Saga Generate] ✅ Payment verified:', paymentData.walletAddress);

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

    // Check if there's already a pending/generating saga for this game_id
    // If yes, return existing saga instead of creating a new one (prevent duplicate charges)
    const { data: existingSagas, error: checkError } = await supabase
      .from('sagas')
      .select('id, status, progress_percent, created_at')
      .eq('game_id', gameId)
      .in('status', ['pending', 'generating_story', 'generating_images', 'rendering'])
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!checkError && existingSagas && existingSagas.length > 0) {
      const existingSaga = existingSagas[0];
      const ageSeconds = (Date.now() - new Date(existingSaga.created_at).getTime()) / 1000;
      
      // If saga is less than 5 minutes old and still processing, return it
      if (ageSeconds < 300) {
        console.log(`[Saga Generate] ⚠️  Found existing saga ${existingSaga.id} for game ${gameId} (${Math.floor(ageSeconds)}s old, status: ${existingSaga.status})`);
        return NextResponse.json({
          sagaId: existingSaga.id,
          status: 'existing',
          message: 'Saga already exists for this game',
          existingStatus: existingSaga.status,
          progress: existingSaga.progress_percent || 0
        });
      } else {
        console.log(`[Saga Generate] ℹ️  Existing saga is ${Math.floor(ageSeconds)}s old, creating new one...`);
      }
    }

    // Create new saga
    console.log('[Saga Generate] ✅ Creating new saga...');

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

    // NOTE: Worker pattern doesn't work in Vercel serverless
    // Workers require a continuously running process, but Vercel instances are ephemeral
    // Instead, we use /api/saga/process endpoint which is triggered by frontend polling
    console.log('[Saga Generate] ℹ️  Skipping worker initialization (Vercel serverless - using /api/saga/process instead)');

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

