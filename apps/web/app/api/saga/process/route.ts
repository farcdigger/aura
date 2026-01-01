// apps/web/app/api/saga/process/route.ts
// Manual worker trigger endpoint - processes one job from the queue
// This endpoint can be called periodically to process jobs in Vercel serverless environment

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // Import queue
    const { sagaQueue } = await import('@/lib/saga/queue/saga-queue');
    
    // Get waiting or active jobs
    const waitingJobs = await sagaQueue.getJobs(['waiting']);
    const activeJobs = await sagaQueue.getJobs(['active']);
    
    console.log(`[Process] Queue status: ${waitingJobs.length} waiting, ${activeJobs.length} active`);
    
    // Process waiting jobs first, then check active jobs that might be stuck
    const jobsToProcess = waitingJobs.length > 0 ? waitingJobs : activeJobs;
    
    if (jobsToProcess.length === 0) {
      return NextResponse.json({
        message: 'No jobs to process',
        waiting: waitingJobs.length,
        active: activeJobs.length
      });
    }
    
    // Get the first job
    const job = jobsToProcess[0];
    let { sagaId, gameId, userWallet } = job.data;
    
    console.log(`[Process] 🎯 Processing job ${job.id} for saga ${sagaId}`);
    console.log(`[Process] Job data:`, { sagaId, gameId, userWallet, jobId: job.id });
    
    // Import worker processing function directly
    // In Vercel serverless, we process jobs directly instead of using worker pattern
    const { supabase } = await import('@/lib/saga/database/supabase');
    const { fetchGameData } = await import('@/lib/saga/blockchain/bibliotheca');
    const { extractScenes, createComicPages } = await import('@/lib/saga/ai/scene-extractor');
    const { generateComicPages: generateComicPageImages } = await import('@/lib/saga/ai/image-generator');
    
    // Check saga status and last update time
    let existingSaga: any = null;
    let actualSagaId = sagaId;
    
    const { data: sagaById, error: sagaError } = await supabase
      .from('sagas')
      .select('id, status, updated_at, current_step, progress_percent')
      .eq('id', sagaId)
      .single();
    
    if (sagaById && !sagaError) {
      existingSaga = sagaById;
    } else {
      console.warn(`[Process] Saga ${sagaId} not found by ID. Error:`, sagaError);
      
      // Try to find saga by game_id as fallback
      if (gameId) {
        console.log(`[Process] Trying to find saga by game_id: ${gameId}`);
        const { data: sagaByGameId, error: gameIdError } = await supabase
          .from('sagas')
          .select('id, status, updated_at, current_step, progress_percent')
          .eq('game_id', gameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (sagaByGameId && !gameIdError) {
          console.log(`[Process] ✅ Found saga by game_id: ${sagaByGameId.id} (expected: ${sagaId})`);
          existingSaga = sagaByGameId;
          actualSagaId = sagaByGameId.id;
        } else {
          // Saga not found by game_id either, remove job
          console.warn(`[Process] Saga not found by game_id either. Removing job.`);
          try {
            await job.remove();
          } catch (e) {
            // Ignore errors
          }
          return NextResponse.json({ 
            message: 'Saga not found in database',
            error: sagaError?.message || gameIdError?.message
          }, { status: 200 });
        }
      } else {
        // No gameId to search by, remove job
        try {
          await job.remove();
        } catch (e) {
          // Ignore errors
        }
        return NextResponse.json({ 
          message: 'Saga not found in database',
          error: sagaError?.message 
        }, { status: 200 });
      }
    }
    
    // Update sagaId if we found a different saga
    if (actualSagaId !== sagaId) {
      console.log(`[Process] Using saga ID ${actualSagaId} instead of ${sagaId}`);
      sagaId = actualSagaId;
    }
    
    if (existingSaga.status === 'completed' || existingSaga.status === 'failed') {
      return NextResponse.json({
        message: `Saga already ${existingSaga.status}`,
        status: existingSaga.status
      });
    }
    
    // If saga is already processing images, check if it's actively being processed
    // (updated in last 60 seconds means it's still being processed)
    if (existingSaga.status === 'generating_images' && existingSaga.updated_at) {
      const lastUpdate = new Date(existingSaga.updated_at).getTime();
      const now = Date.now();
      const secondsSinceUpdate = (now - lastUpdate) / 1000;
      
      // If updated recently (within 60 seconds), don't start a new process
      if (secondsSinceUpdate < 60) {
        console.log(`[Process] Saga ${sagaId} is already being processed (updated ${Math.floor(secondsSinceUpdate)}s ago), skipping...`);
        return NextResponse.json({
          message: 'Saga is already being processed',
          status: existingSaga.status,
          progress: existingSaga.progress_percent || 0,
          lastUpdate: secondsSinceUpdate
        });
      }
    }
    
    // Process job directly (this will be async, but we return immediately)
    // The job will continue processing in the background
    processJobDirectly(job, sagaId, gameId, userWallet, supabase, fetchGameData, extractScenes, createComicPages, generateComicPageImages)
      .catch(err => {
        console.error(`[Process] Error processing job ${job.id}:`, err);
      });
    
    return NextResponse.json({
      message: 'Job processing started',
      jobId: job.id,
      sagaId,
      status: 'processing'
    });
  } catch (error: any) {
    console.error('[Process] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Direct job processing function (for Vercel serverless)
async function processJobDirectly(
  job: any,
  sagaId: string,
  gameId: string,
  userWallet: string,
  supabase: any,
  fetchGameData: any,
  extractScenes: any,
  createComicPages: any,
  generateComicPageImages: any
) {
  try {
    console.log(`[Process] 🎯 Starting direct processing for saga ${sagaId}`);
    
    // Helper function to update progress
    const updateProgress = async (step: string, progress: number) => {
      try {
        await job.updateProgress({ step, progress });
        await supabase
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
      } catch (err: any) {
        console.warn(`[Process] Error updating progress:`, err.message);
      }
    };
    
    // Step 1: Fetch game data
    await updateProgress('fetching_data', 10);
    const gameData = await fetchGameData(gameId);
    console.log(`[Process] Fetched game data: ${gameData.logs.length} logs`);
    
    // Step 2: Extract scenes
    await updateProgress('generating_story', 30);
    const totalTurns = gameData.logs.length || gameData.adventurer.xp || 100;
    const scenes = extractScenes(gameData.adventurer, gameData.logs, totalTurns);
    console.log(`[Process] Extracted ${scenes.length} scenes`);
    
    // Step 3: Create comic pages
    const comicPages = createComicPages(scenes);
    console.log(`[Process] Created ${comicPages.length} comic pages`);
    
    // Step 4: Generate images
    await updateProgress('generating_images', 50);
    
    // Character seed
    const { hashWalletToSeed } = await import('@/lib/saga/queue/saga-queue');
    const characterSeed = hashWalletToSeed(userWallet);
    
    const pagesForGeneration = comicPages.map((page: any) => ({
      panels: page.scenes.map((scene: any) => ({
        speechBubble: scene.speechBubble,
        imagePrompt: scene.description
      })),
      imagePrompt: page.imagePrompt
    }));
    
    const pageImages = await generateComicPageImages(
      pagesForGeneration,
      characterSeed,
      async (currentIndex: number, total: number) => {
        const imageProgress = 50 + Math.floor((currentIndex / total) * 40);
        await updateProgress('generating_images', imageProgress);
      }
    );
    
    // Step 5: Combine pages and panels
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
    
    const panels = scenes.map((scene: any, i: number) => {
      const pageIndex = Math.floor(i / 4);
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
    
    const storyTitle = gameData.adventurer.health === 0 
      ? `The Fall of ${gameData.adventurer.name || 'the Hero'}`
      : `The Journey of ${gameData.adventurer.name || 'the Hero'}`;
    
    // Step 6: Save to database
    await updateProgress('saving', 95);
    
    const generationTime = Math.floor((Date.now() - job.timestamp) / 1000);
    const costUsd = 0.09;
    
    const updateData = {
      status: 'completed' as const,
      story_text: storyTitle,
      panels: panels,
      pages: pages,
      total_panels: panels.length,
      total_pages: pages.length,
      generation_time_seconds: generationTime,
      cost_usd: costUsd,
      completed_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('sagas')
      .update(updateData)
      .eq('id', sagaId)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }
    
    // Final progress update
    await supabase
      .from('sagas')
      .update({ progress_percent: 100 })
      .eq('id', sagaId);
    
    console.log(`[Process] ✅ Saga ${sagaId} completed successfully`);
    
    // Mark job as completed
    await job.moveToCompleted(updateData, 'completed');
    
  } catch (error: any) {
    console.error(`[Process] ❌ Error processing saga ${sagaId}:`, error);
    
    // Mark saga as failed
    await supabase
      .from('sagas')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', sagaId);
    
    // Mark job as failed
    await job.moveToFailed(error, 'failed');
    
    throw error;
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

