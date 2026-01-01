// apps/web/app/api/saga/[sagaId]/status/route.ts
// Get saga status and progress

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// In-memory cache for status (to reduce database load)
const statusCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 2000; // 2 seconds

export async function GET(
  req: NextRequest,
  { params }: { params: { sagaId: string } }
) {
  try {
    const { sagaId } = params;
    
    if (!sagaId) {
      return NextResponse.json(
        { error: 'Saga ID is required' },
        { status: 400 }
      );
    }

    // Check cache first (but not for completed/failed statuses)
    const cached = statusCache.get(sagaId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Don't cache completed/failed statuses - always fetch fresh
      if (cached.data.status !== 'completed' && cached.data.status !== 'failed') {
        return NextResponse.json(cached.data, {
          headers: {
            'Cache-Control': 'no-store, max-age=0, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
    }

    // Import supabase
    const { supabase } = await import('@/lib/saga/database/supabase');

    // Fetch saga status from database
    const { data: saga, error } = await supabase
      .from('sagas')
      .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
      .eq('id', sagaId)
      .single();

    if (error) {
      console.error(`[Saga Status] Error fetching saga ${sagaId}:`, error);
      return NextResponse.json(
        { error: `Saga not found: ${error.message}` },
        { status: 404 }
      );
    }

    if (!saga) {
      return NextResponse.json(
        { error: 'Saga not found' },
        { status: 404 }
      );
    }

    // Debug: Raw database response for status endpoint
    console.log(`[Saga Status] Raw database response for ${sagaId}:`, {
      status: saga.status,
      hasPages: 'pages' in saga,
      pagesValue: saga.pages,
      pagesType: typeof saga.pages,
      pagesIsNull: saga.pages === null,
      pagesIsUndefined: saga.pages === undefined
    });

    // JSONB field'ları parse et (eğer string olarak geliyorsa)
    if (saga.pages && typeof saga.pages === 'string') {
      try {
        saga.pages = JSON.parse(saga.pages);
        console.log(`[Saga Status] ✅ Parsed pages from string to array`);
      } catch (parseError: any) {
        console.warn(`[Saga Status] ⚠️ Failed to parse pages JSON:`, parseError.message);
      }
    }

    if (saga.panels && typeof saga.panels === 'string') {
      try {
        saga.panels = JSON.parse(saga.panels);
        console.log(`[Saga Status] ✅ Parsed panels from string to array`);
      } catch (parseError: any) {
        console.warn(`[Saga Status] ⚠️ Failed to parse panels JSON:`, parseError.message);
      }
    }

    // Retry mechanism if pages is null (read-after-write consistency)
    // IMPORTANT: Check for pages in generating_images status too (incremental update)
    if (!saga.pages && (saga.status === 'completed' || saga.status === 'generating_images' || saga.status === 'rendering')) {
      console.warn(`[Saga Status] ⚠️ Pages is null for ${saga.status} saga. Retrying fetch...`);
      let retryCount = 0;
      const maxRetries = 3;
      const baseDelay = 500;

      while (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, retryCount)));
        
        const { data: retrySaga, error: retryError } = await supabase
          .from('sagas')
          .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
          .eq('id', sagaId)
          .single();

        if (retrySaga && retrySaga.pages) {
          saga.pages = retrySaga.pages;
          if (typeof saga.pages === 'string') {
            try {
              saga.pages = JSON.parse(saga.pages);
            } catch (e) {
              // Ignore parse errors
            }
          }
          console.log(`[Saga Status] ✅ Pages found after retry ${retryCount + 1} (${Array.isArray(saga.pages) ? saga.pages.length : 0} pages)`);
          break;
        }
        retryCount++;
      }
    }

    // Prepare response data
    const responseData = {
      id: saga.id,
      status: saga.status,
      progress_percent: saga.progress_percent || 0,
      current_step: saga.current_step || 'pending',
      story_text: saga.story_text,
      total_pages: saga.total_pages || (saga.pages ? saga.pages.length : 0),
      total_panels: saga.total_panels || 0,
      pages: saga.pages || null,
      generation_time_seconds: saga.generation_time_seconds,
      cost_usd: saga.cost_usd,
      created_at: saga.created_at,
      completed_at: saga.completed_at
    };

    // Update cache (but not for completed/failed statuses)
    if (saga.status !== 'completed' && saga.status !== 'failed') {
      statusCache.set(sagaId, { data: responseData, timestamp: Date.now() });
    }

    // Completed veya failed durumunda cache'i bypass et (her zaman fresh data)
    if (saga.status === 'completed' || saga.status === 'failed') {
      statusCache.delete(sagaId);
      console.log(`[Saga Status] ✅ Cache cleared for ${sagaId} (status: ${saga.status})`);
    }

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('[Saga Status] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

