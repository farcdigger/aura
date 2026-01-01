// apps/web/app/api/saga/[sagaId]/route.ts
// Fetch saga by ID

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    // Import supabase
    const { supabase } = await import('@/lib/saga/database/supabase');

    // Fetch saga from database
    const { data: saga, error } = await supabase
      .from('sagas')
      .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
      .eq('id', sagaId)
      .single();

    if (error) {
      console.error(`[Saga API] Error fetching saga ${sagaId}:`, error);
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

    // Debug: Raw database response
    if (saga) {
      console.log(`[Saga API] Raw database response:`, {
        hasPages: 'pages' in saga,
        pagesValue: saga.pages,
        pagesType: typeof saga.pages,
        pagesIsNull: saga.pages === null,
        pagesIsUndefined: saga.pages === undefined
      });
    }

    // JSONB field'ları parse et (eğer string olarak geliyorsa)
    if (saga.pages && typeof saga.pages === 'string') {
      try {
        saga.pages = JSON.parse(saga.pages);
        console.log(`[Saga API] ✅ Parsed pages from string to array`);
      } catch (parseError: any) {
        console.warn(`[Saga API] ⚠️ Failed to parse pages JSON:`, parseError.message);
      }
    }

    if (saga.panels && typeof saga.panels === 'string') {
      try {
        saga.panels = JSON.parse(saga.panels);
        console.log(`[Saga API] ✅ Parsed panels from string to array`);
      } catch (parseError: any) {
        console.warn(`[Saga API] ⚠️ Failed to parse panels JSON:`, parseError.message);
      }
    }

    // Retry mechanism if pages is null (read-after-write consistency)
    if (!saga.pages && saga.status === 'completed') {
      console.warn(`[Saga API] ⚠️ Pages is null for completed saga. Retrying fetch...`);
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
          console.log(`[Saga API] ✅ Pages found after retry ${retryCount + 1}`);
          break;
        }
        retryCount++;
      }
    }

    return NextResponse.json(saga, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('[Saga API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

