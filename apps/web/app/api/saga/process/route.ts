// apps/web/app/api/saga/process/route.ts
// Manual worker trigger endpoint - processes one job from the queue
// This endpoint can be called periodically to process jobs in Vercel serverless environment

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Increase timeout for Pro plan (max 300s for Pro, 60s for Hobby)
export const maxDuration = 60; // 60 seconds - adjust based on your Vercel plan

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
    
    // NOTE: Don't remove job - it's needed for tracking
    // Lock mismatch errors happen when multiple instances try to process the same job
    // We handle this by checking saga status before processing
    
    // Import worker processing function directly
    // In Vercel serverless, we process jobs directly instead of using worker pattern
    const { supabase } = await import('@/lib/saga/database/supabase');
    const { fetchGameData } = await import('@/lib/saga/blockchain/bibliotheca');
    const { extractScenes, createComicPages } = await import('@/lib/saga/ai/scene-extractor');
    const { generateComicPages: generateComicPageImages } = await import('@/lib/saga/ai/image-generator');
    
    // Check saga status and last update time
    let existingSaga: any = null;
    let actualSagaId = sagaId;
    
    console.log(`[Process] 🔍 Looking for saga with ID: ${sagaId}, gameId: ${gameId}`);
    
    const { data: sagaById, error: sagaError } = await supabase
      .from('sagas')
      .select('id, status, created_at, completed_at, current_step, progress_percent, game_id')
      .eq('id', sagaId)
      .single();
    
    console.log(`[Process] Saga lookup by ID result:`, { 
      found: !!sagaById, 
      error: sagaError?.message,
      sagaId: sagaById?.id,
      status: sagaById?.status 
    });
    
    if (sagaById && !sagaError) {
      existingSaga = sagaById;
      console.log(`[Process] ✅ Found saga by ID: ${sagaById.id}, status: ${sagaById.status}`);
    } else {
      console.warn(`[Process] Saga ${sagaId} not found by ID. Error:`, sagaError?.message || 'No error but no data');
      
      // Try to find saga by game_id as fallback
      if (gameId) {
        // Clean gameId (remove # prefix if present)
        const cleanGameId = gameId.toString().replace(/^#?ID:/, '').trim();
        console.log(`[Process] Trying to find saga by game_id: ${cleanGameId} (original: ${gameId})`);
        
        const { data: sagaByGameId, error: gameIdError } = await supabase
          .from('sagas')
          .select('id, status, created_at, completed_at, current_step, progress_percent, game_id')
          .eq('game_id', cleanGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        console.log(`[Process] Saga lookup by game_id result:`, { 
          found: !!sagaByGameId, 
          error: gameIdError?.message,
          sagaId: sagaByGameId?.id,
          status: sagaByGameId?.status 
        });
        
        if (sagaByGameId && !gameIdError) {
          console.log(`[Process] ✅ Found saga by game_id: ${sagaByGameId.id} (expected: ${sagaId})`);
          existingSaga = sagaByGameId;
          actualSagaId = sagaByGameId.id;
        } else {
          // Saga not found by game_id either, but don't remove job - it might be processing
          console.warn(`[Process] Saga not found by game_id either. Error: ${gameIdError?.message || 'No saga found'}`);
          // Don't remove job - it might be in progress
          return NextResponse.json({ 
            message: 'Saga not found in database',
            error: sagaError?.message || gameIdError?.message,
            sagaId,
            gameId: cleanGameId
          }, { status: 200 });
        }
      } else {
        // No gameId to search by
        console.warn(`[Process] No gameId provided, cannot search by game_id`);
        return NextResponse.json({ 
          message: 'Saga not found in database and no gameId provided',
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
    // Use created_at or completed_at to determine if saga is stuck
    if (existingSaga.status === 'generating_images' || existingSaga.status === 'rendering') {
      const lastUpdate = existingSaga.completed_at 
        ? new Date(existingSaga.completed_at).getTime()
        : new Date(existingSaga.created_at).getTime();
      const now = Date.now();
      const secondsSinceUpdate = (now - lastUpdate) / 1000;
      
      console.log(`[Process] Saga ${sagaId} status: ${existingSaga.status}, progress: ${existingSaga.progress_percent}%, created: ${Math.floor(secondsSinceUpdate)}s ago`);
      
      // If progress is 95+ and saga is stuck in generating_images/rendering for 2+ minutes, continue processing
      if (existingSaga.progress_percent >= 95 && secondsSinceUpdate > 120) {
        console.log(`[Process] Saga ${sagaId} appears stuck (${existingSaga.status}, ${existingSaga.progress_percent}%, ${Math.floor(secondsSinceUpdate)}s old), continuing processing...`);
        // Continue processing
      } else if (secondsSinceUpdate < 60 && existingSaga.progress_percent < 95) {
        // Saga was created/updated recently and still processing - don't restart
        console.log(`[Process] Saga ${sagaId} is actively being processed (${Math.floor(secondsSinceUpdate)}s ago), skipping...`);
        return NextResponse.json({
          message: 'Saga is already being processed',
          status: existingSaga.status,
          progress: existingSaga.progress_percent || 0,
          lastUpdate: secondsSinceUpdate
        });
      } else {
        // Saga might be stuck - continue processing
        console.log(`[Process] Saga ${sagaId} may be stuck, continuing processing...`);
      }
    }
    
    // Rate limit protection: if saga is generating_images and was created less than 15 seconds ago, skip
    // This prevents multiple concurrent requests to Replicate API
    if (existingSaga.status === 'generating_images') {
      const createdTime = new Date(existingSaga.created_at).getTime();
      const now = Date.now();
      const secondsSinceCreated = (now - createdTime) / 1000;
      
      // If saga was created less than 15 seconds ago, it's likely still processing the first image
      // Don't start a new process to avoid rate limits
      if (secondsSinceCreated < 15) {
        console.log(`[Process] Saga ${sagaId} was created ${Math.floor(secondsSinceCreated)}s ago, skipping to avoid rate limits...`);
        return NextResponse.json({
          message: 'Saga is being processed, waiting to avoid rate limits',
          status: existingSaga.status,
          progress: existingSaga.progress_percent || 0,
          waitTime: 15 - secondsSinceCreated
        });
      }
    }
    
    // CRITICAL FIX: In Vercel serverless, we MUST await the process
    // If we return immediately, the instance will be killed and processing stops
    // However, this means we might hit timeout limits
    // Solution: Process incrementally - generate one page at a time and save immediately
    
    try {
      // Start processing but don't wait for completion (to avoid timeout)
      // Instead, process will save each page incrementally
      processJobDirectly(job, sagaId, gameId, userWallet, supabase, fetchGameData, extractScenes, createComicPages, generateComicPageImages)
        .catch(async (err) => {
          console.error(`[Process] Error processing job ${job.id}:`, err);
          // Mark saga as failed if error occurs
          try {
            const { error: updateError } = await supabase
              .from('sagas')
              .update({ status: 'failed', completed_at: new Date().toISOString() })
              .eq('id', sagaId);
            
            if (updateError) {
              console.error(`[Process] Failed to mark saga as failed:`, updateError);
            }
          } catch (updateErr: any) {
            console.error(`[Process] Error updating saga status:`, updateErr);
          }
        });
      
      // Return immediately - processing continues in background
      // Frontend will poll status and trigger /api/saga/process again if needed
      return NextResponse.json({
        message: 'Job processing started',
        jobId: job.id,
        sagaId,
        status: 'processing',
        note: 'Processing continues in background. Frontend will poll for status updates.'
      });
    } catch (error: any) {
      console.error(`[Process] Failed to start processing:`, error);
      return NextResponse.json({
        error: error.message || 'Failed to start processing',
        sagaId
      }, { status: 500 });
    }
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
    
    // Step 4: Check existing pages in database (incremental update)
    const { data: existingSagaData, error: existingSagaError } = await supabase
      .from('sagas')
      .select('pages, story_text')
      .eq('id', sagaId)
      .single();
    
    if (existingSagaError) {
      console.error(`[Process] ⚠️  Error fetching existing saga data:`, existingSagaError);
    }
    
    // Handle null/undefined pages properly
    let existingPages: any[] = [];
    if (existingSagaData?.pages) {
      if (Array.isArray(existingSagaData.pages)) {
        existingPages = existingSagaData.pages;
      } else {
        console.warn(`[Process] ⚠️  Pages is not an array:`, typeof existingSagaData.pages);
      }
    }
    
    const existingPageNumbers = new Set(existingPages.map((p: any) => p?.pageNumber).filter((n: any) => n != null));
    
    console.log(`[Process] 📊 Existing pages in DB: ${existingPages.length}/${comicPages.length}`);
    console.log(`[Process] 📊 Existing page numbers:`, Array.from(existingPageNumbers));
    console.log(`[Process] 📊 Existing saga data:`, { 
      hasPages: !!existingSagaData?.pages, 
      pagesType: typeof existingSagaData?.pages,
      pagesIsArray: Array.isArray(existingSagaData?.pages),
      pagesLength: Array.isArray(existingSagaData?.pages) ? existingSagaData.pages.length : 'N/A'
    });
    
    // Step 5: Generate images incrementally (only missing pages)
    await updateProgress('generating_images', 50);
    
    // Character seed
    const { hashWalletToSeed } = await import('@/lib/saga/queue/saga-queue');
    const characterSeed = hashWalletToSeed(userWallet);
    
    // Helper function to save a single page to database
    const savePageToDatabase = async (pageData: any, pageIndex: number, totalPages: number) => {
      try {
        // Get current pages from database
        const { data: currentSaga } = await supabase
          .from('sagas')
          .select('pages')
          .eq('id', sagaId)
          .single();
        
        const currentPages: any[] = currentSaga?.pages || [];
        
        // Update or add this page
        const pageExists = currentPages.findIndex((p: any) => p.pageNumber === pageData.pageNumber);
        if (pageExists >= 0) {
          currentPages[pageExists] = pageData;
        } else {
          currentPages.push(pageData);
        }
        
        // Sort by page number
        currentPages.sort((a: any, b: any) => a.pageNumber - b.pageNumber);
        
        // Update progress
        const progress = 50 + Math.floor((pageIndex / totalPages) * 40);
        
        // Save to database
        const { error: saveError } = await supabase
          .from('sagas')
          .update({
            pages: currentPages,
            progress_percent: progress,
            current_step: 'generating_images',
            status: 'generating_images'
          })
          .eq('id', sagaId);
        
        if (saveError) {
          console.error(`[Process] ❌ Error saving page ${pageData.pageNumber}:`, saveError);
          throw saveError;
        }
        
        console.log(`[Process] ✅ Saved page ${pageData.pageNumber}/${totalPages} to database (progress: ${progress}%)`);
      } catch (err: any) {
        console.error(`[Process] ❌ Failed to save page ${pageData.pageNumber}:`, err.message);
        throw err;
      }
    };
    
    // Generate images for missing pages only
    const pagesToGenerate: number[] = [];
    for (let i = 0; i < comicPages.length; i++) {
      if (!existingPageNumbers.has(comicPages[i].pageNumber)) {
        pagesToGenerate.push(i);
      }
    }
    
    console.log(`[Process] 🎨 Generating ${pagesToGenerate.length} missing pages out of ${comicPages.length} total`);
    
    if (pagesToGenerate.length === 0) {
      console.log(`[Process] ✅ All pages already generated, skipping image generation`);
    } else {
      // Generate images one by one and save immediately
      for (let idx = 0; idx < pagesToGenerate.length; idx++) {
        const pageIndex = pagesToGenerate[idx];
        const page = comicPages[pageIndex];
        const pageForGeneration = {
          panels: page.scenes.map((scene: any) => ({
            speechBubble: scene.speechBubble,
            imagePrompt: scene.description
          })),
          imagePrompt: page.imagePrompt
        };
        
        try {
          console.log(`[Process] 🎨 Generating page ${page.pageNumber} (${idx + 1}/${pagesToGenerate.length} missing pages)...`);
          
          // Rate limit protection: wait 12s between requests (except first)
          if (idx > 0) {
            console.log(`[Process] ⏳ Waiting 12s before generating next page (rate limit protection)...`);
            await new Promise(resolve => setTimeout(resolve, 12000));
          }
          
          // Generate single page image
          const { generateComicPage } = await import('@/lib/saga/ai/image-generator');
          console.log(`[Process] 🎨 Calling generateComicPage for page ${page.pageNumber}...`);
          
          const imageResult = await generateComicPage(
            pageForGeneration.panels,
            characterSeed ? characterSeed + pageIndex : undefined,
            pageForGeneration.imagePrompt
          );
          
          console.log(`[Process] ✅ Image generated for page ${page.pageNumber}, URL: ${imageResult.url?.substring(0, 50)}...`);
          
          // Create page data
          const pageData = {
            pageNumber: page.pageNumber,
            panels: page.scenes.map((scene: any) => ({
              panelNumber: scene.panelNumber,
              speechBubble: scene.speechBubble,
              narration: scene.speechBubble,
              imagePrompt: scene.description,
              sceneType: scene.sceneType,
              mood: 'dramatic' as const
            })),
            pageImageUrl: imageResult.url,
            pageDescription: page.pageDescription
          };
          
          // Save immediately to database (with retry)
          console.log(`[Process] 💾 Saving page ${page.pageNumber} to database...`);
          let saveAttempts = 0;
          const maxSaveAttempts = 3;
          while (saveAttempts < maxSaveAttempts) {
            try {
              await savePageToDatabase(pageData, pageIndex + 1, comicPages.length);
              console.log(`[Process] ✅ Page ${page.pageNumber} generated and saved successfully`);
              break; // Success, exit retry loop
            } catch (saveErr: any) {
              saveAttempts++;
              console.error(`[Process] ❌ Failed to save page ${page.pageNumber} (attempt ${saveAttempts}/${maxSaveAttempts}):`, saveErr.message);
              if (saveAttempts >= maxSaveAttempts) {
                // Last attempt failed, but don't throw - continue with next page
                console.error(`[Process] ⚠️  Giving up on saving page ${page.pageNumber}, continuing with next page...`);
              } else {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * saveAttempts));
              }
            }
          }
          
        } catch (error: any) {
          console.error(`[Process] ❌ Error generating page ${comicPages[pageIndex].pageNumber}:`, error);
          
          // Check if it's a rate limit error
          const isRateLimit = error.status === 429 || 
                              error.message?.includes('429') || 
                              error.message?.includes('rate limit') ||
                              error.message?.includes('Too Many Requests') ||
                              error.message?.includes('Rate limit exceeded');
          
          if (isRateLimit) {
            // Extract retry_after from error
            let retryAfter = error.retryAfter || 10;
            try {
              const match = error.message?.match(/retry after[":\s]*(\d+)/i);
              if (match) {
                retryAfter = parseInt(match[1]) || 10;
              }
            } catch (e) {
              // Ignore parse errors
            }
            
            console.warn(`[Process] ⚠️  Rate limit hit for page ${comicPages[pageIndex].pageNumber}, retry after ${retryAfter}s`);
            
            // Wait for retry_after + buffer
            const waitTime = (retryAfter + 5) * 1000; // Add 5s buffer
            console.log(`[Process] ⏳ Waiting ${waitTime/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Retry once
            try {
              console.log(`[Process] 🔄 Retrying page ${comicPages[pageIndex].pageNumber} after rate limit...`);
              const { generateComicPage } = await import('@/lib/saga/ai/image-generator');
              const imageResult = await generateComicPage(
                pageForGeneration.panels,
                characterSeed ? characterSeed + pageIndex : undefined,
                pageForGeneration.imagePrompt
              );
              
              const pageData = {
                pageNumber: page.pageNumber,
                panels: page.scenes.map((scene: any) => ({
                  panelNumber: scene.panelNumber,
                  speechBubble: scene.speechBubble,
                  narration: scene.speechBubble,
                  imagePrompt: scene.description,
                  sceneType: scene.sceneType,
                  mood: 'dramatic' as const
                })),
                pageImageUrl: imageResult.url,
                pageDescription: page.pageDescription
              };
              
              // Save to database
              await savePageToDatabase(pageData, pageIndex + 1, comicPages.length);
              console.log(`[Process] ✅ Page ${page.pageNumber} generated and saved after retry`);
              
            } catch (retryError: any) {
              // Retry also failed - stop processing this page, continue with next
              console.error(`[Process] ❌ Retry also failed for page ${comicPages[pageIndex].pageNumber}:`, retryError.message);
              console.warn(`[Process] ⚠️  Skipping page ${comicPages[pageIndex].pageNumber}, will retry on next trigger`);
              // Don't throw - continue with next page
              continue; // Skip to next page
            }
          } else {
            // For other errors, log and continue (don't throw - let other pages generate)
            console.error(`[Process] ❌ Non-rate-limit error for page ${comicPages[pageIndex].pageNumber}:`, error.message);
            console.warn(`[Process] ⚠️  Skipping page ${comicPages[pageIndex].pageNumber}, will retry on next trigger`);
            continue; // Skip to next page instead of throwing
          }
        }
      }
    }
    
    // Step 6: Finalize - combine all pages and panels
    const { data: finalSagaData } = await supabase
      .from('sagas')
      .select('pages')
      .eq('id', sagaId)
      .single();
    
    const finalPages: any[] = finalSagaData?.pages || [];
    
    if (finalPages.length !== comicPages.length) {
      console.warn(`[Process] ⚠️  Not all pages generated yet: ${finalPages.length}/${comicPages.length}`);
      console.log(`[Process] ℹ️  Process will continue on next trigger`);
      return; // Exit - will resume on next trigger
    }
    
    // All pages generated, create panels and finalize
    const panels = scenes.map((scene: any, i: number) => {
      const pageIndex = Math.floor(i / 4);
      const page = finalPages[pageIndex];
      return {
        panelNumber: scene.panelNumber,
        speechBubble: scene.speechBubble,
        narration: scene.speechBubble,
        imagePrompt: scene.description,
        imageUrl: page?.pageImageUrl || '',
        sceneType: scene.sceneType,
        mood: 'dramatic' as const
      };
    });
    
    const storyTitle = gameData.adventurer.health === 0 
      ? `The Fall of ${gameData.adventurer.name || 'the Hero'}`
      : `The Journey of ${gameData.adventurer.name || 'the Hero'}`;
    
    // Step 7: Final save to database
    await updateProgress('saving', 95);
    
    const generationTime = Math.floor((Date.now() - job.timestamp) / 1000);
    const costUsd = 0.09;
    
    const updateData = {
      status: 'completed' as const,
      story_text: storyTitle,
      panels: panels,
      pages: finalPages,
      total_panels: panels.length,
      total_pages: finalPages.length,
      generation_time_seconds: generationTime,
      cost_usd: costUsd,
      completed_at: new Date().toISOString(),
      progress_percent: 100
    };
    
    console.log(`[Process] 💾 Finalizing saga ${sagaId} in database...`);
    console.log(`[Process] Update data:`, {
      status: updateData.status,
      total_pages: updateData.total_pages,
      total_panels: updateData.total_panels,
      hasPages: !!updateData.pages,
      pagesLength: Array.isArray(updateData.pages) ? updateData.pages.length : 0
    });
    
    const { data: updatedSaga, error: updateError } = await supabase
      .from('sagas')
      .update(updateData)
      .eq('id', sagaId)
      .select('id, status, total_pages, total_panels, pages')
      .single();
    
    if (updateError) {
      console.error(`[Process] ❌ Database update failed:`, updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }
    
    if (!updatedSaga) {
      console.error(`[Process] ❌ Saga not found after update`);
      throw new Error('Saga not found after update');
    }
    
    console.log(`[Process] ✅ Saga ${sagaId} completed successfully:`, {
      id: updatedSaga.id,
      status: updatedSaga.status,
      total_pages: updatedSaga.total_pages,
      hasPages: !!updatedSaga.pages,
      pagesLength: Array.isArray(updatedSaga.pages) ? updatedSaga.pages.length : 0
    });
    
    // Verify status was updated correctly
    if (updatedSaga.status !== 'completed') {
      console.error(`[Process] ⚠️  WARNING: Saga status is ${updatedSaga.status}, expected 'completed'`);
      // Force update status
      await supabase
        .from('sagas')
        .update({ status: 'completed' })
        .eq('id', sagaId);
      console.log(`[Process] ✅ Force-updated status to 'completed'`);
    }
    
    // Mark job as completed
    await job.moveToCompleted(updateData, 'completed');
    
  } catch (error: any) {
    console.error(`[Process] ❌ Error processing saga ${sagaId}:`, error);
    
    // Check if it's a rate limit error
    const isRateLimit = error.status === 429 || 
                        error.message?.includes('429') || 
                        error.message?.includes('rate limit') ||
                        error.message?.includes('Too Many Requests') ||
                        error.message?.includes('Rate limit exceeded');
    
    if (isRateLimit) {
      // Extract retry_after from error
      let retryAfter = error.retryAfter || 10;
      
      // Try to parse from error message
      try {
        const match = error.message?.match(/retry_after[":\s]*(\d+)/i) || 
                     error.message?.match(/retry after[":\s]*(\d+)/i);
        if (match) {
          retryAfter = parseInt(match[1]) || 10;
        }
      } catch (e) {
        // Ignore parse errors
      }
      
      // Add buffer (5 seconds) to be safe
      retryAfter = Math.max(retryAfter + 5, 15);
      
      console.warn(`[Process] ⚠️  Rate limit hit for saga ${sagaId}, will retry after ${retryAfter}s`);
      
      // Don't mark as failed - just log and let it retry later
      // The saga will remain in generating_images status and can be retried
      return; // Exit gracefully, don't throw
    }
    
    // For non-rate-limit errors, mark as failed
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

