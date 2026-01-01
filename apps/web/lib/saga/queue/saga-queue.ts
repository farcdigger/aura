// src/lib/queue/saga-queue.ts

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

// Redis connection
// Upstash Redis URL format: redis://xxxxx.upstash.io:6379
// Vercel KV REST API format: https://xxxxx.vercel.app (Not compatible with ioredis directly)
// For now, use Upstash Redis URL or local Redis

const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

// Redis connection (singleton - sadece bir kez oluştur)
let redisConnection: Redis | null = null;

function getRedisConnection(): Redis {
  if (!redisConnection) {
    // Her çağrıda environment variable'ları tekrar oku (dotenv yüklendikten sonra)
    const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Vercel'de localhost Redis çalışmaz - Upstash Redis gerekli
    if (redisUrl === 'redis://localhost:6379' && process.env.VERCEL) {
      const errorMsg = 'Redis URL not configured! Please set UPSTASH_REDIS_URL or REDIS_URL in Vercel environment variables. Localhost Redis does not work on Vercel.';
      console.error('[Queue] ❌', errorMsg);
      throw new Error(errorMsg);
    }
    
    // Debug: Environment variable'ın yüklenip yüklenmediğini kontrol et
    if (process.env.UPSTASH_REDIS_URL) {
      console.log('[Queue] ✅ UPSTASH_REDIS_URL found:', process.env.UPSTASH_REDIS_URL.substring(0, 30) + '...');
    } else if (process.env.REDIS_URL) {
      console.log('[Queue] ✅ REDIS_URL found:', process.env.REDIS_URL.substring(0, 30) + '...');
    } else {
      console.warn('[Queue] ⚠️ Redis URL not set. Using localhost:6379. Make sure Redis is running or set UPSTASH_REDIS_URL.');
    }
    
    if (redisUrl && redisUrl !== 'redis://localhost:6379') {
      console.log('[Queue] Creating Redis connection to:', redisUrl.substring(0, 30) + '...');
    }
    
    // Upstash Redis TLS ayarları
    const isTLS = redisUrl.startsWith('rediss://');
    const connectionOptions: any = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false, // Otomatik bağlan - Worker için gerekli
      retryStrategy: (times: number) => {
        // Retry strategy: İlk 3 denemede hızlı, sonra yavaşla, 10 denemeden sonra dur
        if (times > 10) {
          console.error('[Queue] Redis connection failed after 10 attempts. Please check your Redis configuration.');
          return null; // Retry'yi durdur
        }
        const delay = Math.min(times * 100, 3000); // Max 3 saniye
        return delay;
      },
    };

    // TLS bağlantısı için ek ayarlar (rediss://)
    if (isTLS) {
      connectionOptions.tls = {
        rejectUnauthorized: false, // Upstash için gerekli olabilir
      };
    }

    redisConnection = new Redis(redisUrl, connectionOptions);

    redisConnection.on('connect', () => {
      console.log('[Queue] ✅ Redis connected successfully');
    });

    redisConnection.on('error', (err) => {
      console.error('[Queue] ❌ Redis connection error:', err.message);
      console.error('[Queue] 💡 Make sure Redis is running or UPSTASH_REDIS_URL is set correctly.');
    });

    redisConnection.on('ready', () => {
      console.log('[Queue] ✅ Redis ready');
      // Redis ready olduğunda Worker'ı başlat (eğer henüz başlatılmadıysa)
      if (!globalWorker && typeof window === 'undefined') {
        console.log('[Queue] 🔧 Auto-initializing worker after Redis ready...');
        setTimeout(() => {
          try {
            getOrCreateWorker();
          } catch (err: any) {
            console.warn('[Queue] ⚠️ Failed to auto-initialize worker:', err.message);
          }
        }, 1000);
      }
    });
    
    redisConnection.on('close', () => {
      console.log('[Queue] ⚠️ Redis connection closed');
    });
    
    // Otomatik bağlan (lazyConnect: false ile)
  }
  
  return redisConnection;
}

// Lazy connection getter - sadece gerektiğinde oluştur
function getConnection() {
  return getRedisConnection();
}

export interface SagaJobData {
  sagaId: string;
  gameId: string;
  userWallet: string; // Game data'dan çekilecek, ama job'da da saklıyoruz
}

// Queue tanımla (lazy connection)
export const sagaQueue = new Queue<SagaJobData>('saga-generation', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      count: 10, // Son 10 başarılı job'u sakla (daha az yer kaplar)
      age: 3600 // 1 saat (eski job'lar otomatik silinsin)
    },
    removeOnFail: {
      count: 10, // Son 10 failed job'u sakla
      age: 3600 // 1 saat
    }
  }
});

// Global worker instance (sadece bir kez oluştur)
let globalWorker: ReturnType<typeof createSagaWorker> | null = null;

// Worker (Ayrı process'te çalışacak veya API route'da)
export function createSagaWorker() {
  console.log('[Worker] Creating worker with connection:', getConnection() ? '✅' : '❌');
  return new Worker<SagaJobData>(
    'saga-generation',
    async (job: Job<SagaJobData>) => {
      console.log(`[Worker] 🎯 Job ${job.id} received and starting processing...`);
      // Validate job data
      if (!job.data || !job.data.sagaId || !job.data.gameId) {
        const errorMsg = `Invalid job data: ${JSON.stringify(job.data)}`;
        console.error(`[Worker] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const { sagaId, gameId, userWallet } = job.data;
      
      // Validate sagaId is UUID format (skip old nanoid jobs)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sagaId)) {
        const errorMsg = `Skipping old job with nanoid format (expected UUID): ${sagaId}. This job will be ignored.`;
        console.warn(`[Worker] ⚠️ ${errorMsg}`);
        // Eski job'ları atla - database'de UUID formatında saga yok
        throw new Error(errorMsg);
      }
      
      // Check if saga exists in database (additional validation)
      const { supabase } = await import('../database/supabase');
      const { data: existingSaga, error: checkError } = await supabase
        .from('sagas')
        .select('id, status')
        .eq('id', sagaId)
        .single();
      
      if (checkError || !existingSaga) {
        const errorMsg = `Saga ${sagaId} not found in database. Skipping job.`;
        console.warn(`[Worker] ⚠️ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // If saga is already completed or failed, skip
      if (existingSaga.status === 'completed' || existingSaga.status === 'failed') {
        const errorMsg = `Saga ${sagaId} is already ${existingSaga.status}. Skipping job.`;
        console.warn(`[Worker] ⚠️ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[Worker] Starting to process saga ${sagaId} for game ${gameId}`);
      console.log(`[Worker] Job ID: ${job.id}, Attempt: ${job.attemptsMade + 1}`);

      // Import here to avoid circular dependencies
      const { fetchGameData } = await import('../blockchain/bibliotheca');
      const { extractScenes, createComicPages } = await import('../ai/scene-extractor');
      const { generateComicPages: generateComicPageImages } = await import('../ai/image-generator');
      // supabase already imported above (line 104)

      // Helper function to update progress in both job and database
      const updateProgress = async (step: string, progress: number) => {
        try {
          await job.updateProgress({ step, progress });
          // Also update database
          const { error: updateError } = await supabase
            .from('sagas')
            .update({
              progress_percent: progress,
              current_step: step,
              status: step === 'fetching_data' ? 'pending' : 
                      step === 'generating_story' ? 'generating_story' :
                      step === 'generating_images' ? 'generating_images' :
                      step === 'saving' ? 'rendering' : 'pending'
            } as any)
            .eq('id', sagaId);
          
          if (updateError) {
            console.warn(`[Worker] Failed to update progress in database:`, updateError.message);
            // Progress update hatası job'u durdurmamalı, sadece log'la
          }
        } catch (err: any) {
          console.warn(`[Worker] Error updating progress:`, err.message);
          // Progress update hatası job'u durdurmamalı
        }
      };

      // Step 1: Fetch game data
      await updateProgress('fetching_data', 10);
      const gameData = await fetchGameData(gameId);
      
      console.log(`[Worker] Fetched game data: ${gameData.logs.length} logs, Level ${gameData.adventurer.level}`);

      // Step 2: Extract 20 scenes from game data
      await updateProgress('generating_story', 30);
      const totalTurns = gameData.logs.length || gameData.adventurer.xp || 100;
      const scenes = extractScenes(gameData.adventurer, gameData.logs, totalTurns);
      console.log(`[Worker] Extracted ${scenes.length} scenes from game data`);
      
      // Step 3: Group scenes into comic pages (4 scenes per page)
      const comicPages = createComicPages(scenes);
      console.log(`[Worker] Created ${comicPages.length} comic pages`);

      // Step 4: Generate comic page images (Sequential - Rate limit için)
      await updateProgress('generating_images', 50);
      
      // Character consistency için wallet'ı seed'e çevir
      const characterSeed = hashWalletToSeed(userWallet);
      
      let pageImages;
      try {
        // Comic pages generation with progress updates
        const pagesForGeneration = comicPages.map((page: any) => ({
          panels: page.scenes.map((scene: any) => ({
            speechBubble: scene.speechBubble,
            imagePrompt: scene.description // Individual scene description (for backward compatibility)
          })),
          imagePrompt: page.imagePrompt // Pre-generated combined page prompt (will be used)
        }));
        
        pageImages = await generateComicPageImages(
          pagesForGeneration,
          characterSeed,
          async (currentIndex: number, total: number) => {
            // Her sayfa için progress güncelle: 50% + (current/total) * 40%
            const imageProgress = 50 + Math.floor((currentIndex / total) * 40);
            await updateProgress('generating_images', imageProgress);
          }
        );
      } catch (imageError: any) {
        // Image generation failed - saga'yı failed olarak işaretle
        console.error(`[Worker] Image generation failed for saga ${sagaId}:`, imageError.message);
        
        try {
          const { error: updateError } = await supabase
            .from('sagas')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', sagaId);
          
          if (updateError) {
            console.error(`[Worker] Failed to update saga ${sagaId} status:`, updateError);
          }
        } catch (updateErr: any) {
          console.error(`[Worker] Error updating saga ${sagaId} status:`, updateErr.message);
        }
        
        throw new Error(`Image generation failed: ${imageError.message}`);
      }

      // Step 5: Pages ve panels'i birleştir (imageUrl ekle)
      const pages = comicPages.map((page: any, i: number) => ({
        pageNumber: page.pageNumber,
        panels: page.scenes.map((scene: any) => ({
          panelNumber: scene.panelNumber,
          speechBubble: scene.speechBubble,
          narration: scene.speechBubble,
          imagePrompt: scene.description,
          sceneType: scene.sceneType,
          mood: 'dramatic' as const
        })),
        pageImageUrl: pageImages[i].url,
        pageDescription: page.pageDescription
      }));
      
      // Backward compatibility için panels array'i de oluştur
      const panels = scenes.map((scene: any, i: number) => {
        const pageIndex = Math.floor(i / 4); // Her sayfada 4 panel
        return {
          panelNumber: scene.panelNumber,
          speechBubble: scene.speechBubble,
          narration: scene.speechBubble,
          imagePrompt: scene.description,
          imageUrl: pageImages[pageIndex]?.url || '',
          sceneType: scene.sceneType,
          mood: 'dramatic' as const
        };
      });
      
      // Story title oluştur
      const storyTitle = gameData.adventurer.health === 0 
        ? `The Fall of ${gameData.adventurer.name || 'the Hero'}`
        : `The Journey of ${gameData.adventurer.name || 'the Hero'}`;

      // Step 5: Save to database
      await updateProgress('saving', 95);
      
      const generationTime = Math.floor((Date.now() - job.timestamp) / 1000);
      const costUsd = 0.09; // Approximate: $0.03 (story) + $0.06 (images)

      console.log(`[Worker] Saving saga ${sagaId} to database...`, {
        status: 'completed',
        storyTitle,
        panelsCount: panels.length,
        pagesCount: pages.length,
        firstPageImageUrl: pages[0]?.pageImageUrl?.substring(0, 50) + '...' || 'null',
        generationTime,
        costUsd
      });

      // Debug: pages array'ini kontrol et
      console.log(`[Worker] Pages array before save:`, {
        pagesCount: pages.length,
        firstPage: pages[0] ? {
          pageNumber: pages[0].pageNumber,
          hasPageImageUrl: !!pages[0].pageImageUrl,
          pageImageUrl: pages[0].pageImageUrl?.substring(0, 50) + '...' || 'null',
          panelsCount: pages[0].panels?.length || 0
        } : null
      });

      const updateData = {
        status: 'completed' as const,
        story_text: storyTitle,
        panels: panels, // Backward compatibility
        pages: pages, // Comic pages (yeni format) - JSONB field
        total_panels: panels.length,
        total_pages: pages.length,
        generation_time_seconds: generationTime,
        cost_usd: costUsd,
        completed_at: new Date().toISOString()
      };

      // Debug: updateData'yı kontrol et
      console.log(`[Worker] Update data pages:`, {
        hasPages: !!updateData.pages,
        pagesType: typeof updateData.pages,
        pagesIsArray: Array.isArray(updateData.pages),
        pagesLength: Array.isArray(updateData.pages) ? updateData.pages.length : 0,
        firstPageImageUrl: Array.isArray(updateData.pages) && updateData.pages[0] 
          ? (updateData.pages[0] as any).pageImageUrl?.substring(0, 50) + '...' 
          : 'null'
      });

      // Final progress update before saving
      await updateProgress('saving', 99);
      
      // Explicit select ile JSONB field'ları dahil et
      const { data: updatedSaga, error: updateError } = await supabase
        .from('sagas')
        .update(updateData)
        .eq('id', sagaId)
        .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
        .single();
      
      if (updateError) {
        console.error(`[Worker] Failed to update saga ${sagaId}:`, updateError);
        console.error(`[Worker] Update data:`, JSON.stringify(updateData, null, 2));
        throw new Error(`Database update failed: ${updateError.message}`);
      }
      
      // Final progress update to 100%
      await supabase
        .from('sagas')
        .update({ progress_percent: 100 })
        .eq('id', sagaId);

      if (!updatedSaga) {
        console.error(`[Worker] Saga ${sagaId} not found after update`);
        throw new Error(`Saga not found after update`);
      }
      
      // Debug: Database'den dönen data'yı kontrol et
      // JSONB field'ları parse et (eğer string olarak geliyorsa)
      let parsedPages = updatedSaga.pages;
      if (updatedSaga.pages && typeof updatedSaga.pages === 'string') {
        try {
          parsedPages = JSON.parse(updatedSaga.pages);
          console.log(`[Worker] ✅ Parsed pages from string to array`);
        } catch (parseError: any) {
          console.warn(`[Worker] ⚠️ Failed to parse pages JSON:`, parseError.message);
        }
      }
      
      console.log(`[Worker] Updated saga from database:`, {
        hasPages: !!parsedPages,
        pagesType: typeof parsedPages,
        pagesIsArray: Array.isArray(parsedPages),
        pagesLength: Array.isArray(parsedPages) ? parsedPages.length : 0,
        firstPageImageUrl: Array.isArray(parsedPages) && parsedPages[0] 
          ? (parsedPages[0] as any).pageImageUrl?.substring(0, 50) + '...' 
          : 'null',
        rawPagesType: typeof updatedSaga.pages,
        rawPagesIsNull: updatedSaga.pages === null,
        rawPagesIsUndefined: updatedSaga.pages === undefined
      });
      
      // CRITICAL: Eğer pages null ise, Supabase'in read-after-write consistency sorunu olabilir
      // Retry mekanizması ile pages'in gerçekten kaydedildiğini doğrula
      if (!parsedPages || parsedPages === null || !Array.isArray(parsedPages) || parsedPages.length === 0) {
        console.warn(`[Worker] ⚠️ Pages is null/empty after update! This might be a read-after-write consistency issue.`);
        console.warn(`[Worker] ⚠️ Retrying with exponential backoff...`);
        
        // Exponential backoff ile retry (max 3 deneme, toplam ~3 saniye)
        let retryCount = 0;
        const maxRetries = 3;
        let verifiedPages = null;
        
        while (retryCount < maxRetries && !verifiedPages) {
          const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
          console.log(`[Worker] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const { data: retrySaga, error: retryError } = await supabase
            .from('sagas')
            .select('id, pages, total_pages, status')
            .eq('id', sagaId)
            .single();
          
          if (retrySaga && !retryError && retrySaga.pages) {
            // Parse if needed
            let retryParsedPages = retrySaga.pages;
            if (typeof retrySaga.pages === 'string') {
              try {
                retryParsedPages = JSON.parse(retrySaga.pages);
              } catch (e) {
                // Ignore parse error
              }
            }
            
            if (retryParsedPages && Array.isArray(retryParsedPages) && retryParsedPages.length > 0) {
              verifiedPages = retryParsedPages;
              console.log(`[Worker] ✅ Pages verified on retry ${retryCount + 1}:`, {
                pagesLength: verifiedPages.length,
                firstPageImageUrl: verifiedPages[0]?.pageImageUrl?.substring(0, 50) + '...' || 'null'
              });
              break;
            }
          }
          
          retryCount++;
        }
        
        if (!verifiedPages) {
          console.error(`[Worker] ❌ CRITICAL: Pages still null after ${maxRetries} retries!`);
          console.error(`[Worker] ❌ This might indicate a Supabase write issue. Check database manually.`);
          // Don't throw error - let the saga complete, API will retry
        } else {
          console.log(`[Worker] ✅ Pages verified successfully after retry`);
        }
      } else {
        console.log(`[Worker] ✅ Pages verified immediately (no retry needed)`);
      }

      console.log(`[Worker] Saga ${sagaId} saved successfully:`, {
        id: updatedSaga.id,
        status: updatedSaga.status,
        panelsCount: updatedSaga.total_panels,
        hasPanels: !!updatedSaga.panels
      });

      await updateProgress('completed', 100);

      console.log(`[Worker] Saga ${sagaId} completed successfully with ${pages.length} pages (${panels.length} panels total)`);
      return { sagaId, pageCount: pages.length, panelCount: panels.length };
    },
    {
      connection: getConnection(),
      concurrency: 1, // Rate limit için sadece 1 saga aynı anda (image generation sequential)
      limiter: {
        max: 10, // Dakikada max 10 job (rate limit için - daha esnek)
        duration: 60000
      },
      // Job'ların takılı kalmaması için
      lockDuration: 600000, // 10 dakika - image generation uzun sürebilir
      maxStalledCount: 2, // 2 kez takılı kalırsa fail et
      stalledInterval: 30000 // 30 saniyede bir kontrol et
    }
  );
}

// Global worker getter (singleton pattern)
export function getOrCreateWorker(): ReturnType<typeof createSagaWorker> {
  if (!globalWorker) {
    console.log('[Worker] Creating new worker instance...');
    globalWorker = createSagaWorker();
    
    // Worker event'lerini hemen dinle (ready olmadan önce)
    globalWorker.on('ready', () => {
      console.log('[Worker] ✅ Worker is ready and listening for jobs');
    });
    
    globalWorker.on('completed', (job) => {
      console.log(`[Worker] ✅ Job ${job.id} completed`);
    });
    
    globalWorker.on('failed', async (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed:`, err.message);
      
      // Failed job'ları database'de işaretle
      if (job?.data?.sagaId) {
        try {
          const { supabase } = await import('../database/supabase');
          const sagaId = job.data.sagaId;
          
          // UUID formatını kontrol et
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!sagaId || typeof sagaId !== 'string' || !uuidRegex.test(sagaId)) {
            console.error('[Worker] Invalid sagaId format:', sagaId);
            return;
          }
          
          const { error } = await supabase
            .from('sagas')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', sagaId);
          
          if (error) {
            console.error('[Worker] Failed to update saga status:', error);
          } else {
            console.log(`[Worker] Saga ${sagaId} marked as failed`);
          }
        } catch (updateError: any) {
          console.error('[Worker] Error updating saga status:', updateError.message);
        }
      } else {
        console.warn('[Worker] No sagaId in job data, cannot update status');
      }
    });
    
    globalWorker.on('active', (job) => {
      console.log(`[Worker] 🚀 Job ${job.id} is now active`);
      console.log(`[Worker] Job data:`, JSON.stringify(job.data, null, 2));
      console.log(`[Worker] Starting to process job ${job.id}...`);
    });
    
    globalWorker.on('stalled', (jobId) => {
      console.warn(`[Worker] ⚠️ Job ${jobId} stalled - taking too long, will be retried`);
      // Stalled job'u database'de işaretle (ama fail etme, retry edilebilir)
    });
    
    globalWorker.on('error', (error) => {
      console.error('[Worker] Worker error:', error);
    });
    
    console.log('[Worker] Global worker created and ready');
  } else {
    console.log('[Worker] ℹ️ Using existing worker instance');
  }
  
  return globalWorker;
}

// Helper: Wallet address'i seed'e çevir (Character consistency için)
export function hashWalletToSeed(wallet: string): number {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = ((hash << 5) - hash) + wallet.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

