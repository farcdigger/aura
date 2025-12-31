// src/app/api/saga/[sagaId]/route.ts
// Get full saga data

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

// Cache'i devre dışı bırak (dynamic data için)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { sagaId: string } }
) {
  const { sagaId } = params;

  try {
    console.log(`[Saga API] Fetching saga ${sagaId}...`);
    
    // Explicit olarak tüm field'ları select et (JSONB field'ları dahil)
    // ÖNEMLİ: Supabase JSONB field'larını döndürmek için explicit select gerekli
    const { data: saga, error } = await supabase
      .from('sagas')
      .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
      .eq('id', sagaId)
      .single();
    
    // Debug: Raw database response (DETAYLI)
    if (saga) {
      console.log(`[Saga API] ========== RAW DATABASE RESPONSE ==========`);
      console.log(`[Saga API] Saga ID: ${sagaId}`);
      console.log(`[Saga API] Status: ${saga.status}`);
      console.log(`[Saga API] Has 'pages' key:`, 'pages' in saga);
      console.log(`[Saga API] Pages value:`, saga.pages);
      console.log(`[Saga API] Pages type:`, typeof saga.pages);
      console.log(`[Saga API] Pages is null:`, saga.pages === null);
      console.log(`[Saga API] Pages is undefined:`, saga.pages === undefined);
      console.log(`[Saga API] All saga keys:`, Object.keys(saga));
      console.log(`[Saga API] Total pages column:`, saga.total_pages);
      
      // CRITICAL: Eğer pages null ise, read-after-write consistency sorunu olabilir
      // Retry mekanizması ile pages'in gerçekten kaydedildiğini doğrula
      if (saga.pages === null || saga.pages === undefined || (Array.isArray(saga.pages) && saga.pages.length === 0)) {
        console.warn(`[Saga API] ⚠️ Pages is null/empty! This might be a read-after-write consistency issue.`);
        console.warn(`[Saga API] ⚠️ Retrying with exponential backoff...`);
        
        // Exponential backoff ile retry (max 3 deneme, toplam ~3 saniye)
        let retryCount = 0;
        const maxRetries = 3;
        let verifiedPages = null;
        
        while (retryCount < maxRetries && !verifiedPages) {
          const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
          console.log(`[Saga API] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms...`);
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
              saga.pages = verifiedPages;
              console.log(`[Saga API] ✅ Pages verified on retry ${retryCount + 1}:`, {
                pagesLength: verifiedPages.length,
                firstPageImageUrl: verifiedPages[0]?.pageImageUrl?.substring(0, 50) + '...' || 'null'
              });
              break;
            }
          }
          
          retryCount++;
        }
        
        if (!verifiedPages) {
          console.error(`[Saga API] ❌ CRITICAL: Pages still null after ${maxRetries} retries!`);
          console.error(`[Saga API] ❌ This might indicate a database issue. Check database manually.`);
        } else {
          console.log(`[Saga API] ✅ Pages verified successfully after retry`);
        }
      }
      console.log(`[Saga API] =========================================`);
    }

    if (error) {
      console.error(`[Saga API] Database error for ${sagaId}:`, error);
      return NextResponse.json(
        { error: 'Saga not found', details: error.message },
        { status: 404 }
      );
    }

    if (!saga) {
      console.warn(`[Saga API] Saga ${sagaId} not found in database`);
      return NextResponse.json(
        { error: 'Saga not found' },
        { status: 404 }
      );
    }
    
    // JSONB field'ları parse et (eğer string olarak geliyorsa) - RETRY'DEN SONRA
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

    console.log(`[Saga API] ========== SAGA ${sagaId} FETCHED ==========`);
    console.log(`[Saga API] Basic info:`, {
      status: saga.status,
      hasStoryText: !!saga.story_text,
      hasPanels: !!saga.panels,
      panelsCount: saga.panels?.length || saga.total_panels || 0,
      hasPages: !!saga.pages,
      pagesCount: Array.isArray(saga.pages) ? saga.pages.length : 0,
      total_pages: saga.total_pages
    });
    
    if (saga.pages) {
      console.log(`[Saga API] Pages structure:`, {
        isArray: Array.isArray(saga.pages),
        length: Array.isArray(saga.pages) ? saga.pages.length : 'N/A',
        type: typeof saga.pages
      });
      
      if (Array.isArray(saga.pages) && saga.pages.length > 0) {
        const firstPage = saga.pages[0] as any;
        console.log(`[Saga API] First page:`, {
          pageNumber: firstPage?.pageNumber,
          hasPageImageUrl: !!firstPage?.pageImageUrl,
          pageImageUrl: firstPage?.pageImageUrl || 'MISSING',
          pageImageUrlPreview: firstPage?.pageImageUrl?.substring(0, 80) || 'null',
          hasPanels: !!firstPage?.panels,
          panelsCount: firstPage?.panels?.length || 0,
          allKeys: firstPage ? Object.keys(firstPage) : []
        });
        
        // Tüm sayfaları kontrol et
        saga.pages.forEach((page: any, index: number) => {
          console.log(`[Saga API] Page ${index + 1}:`, {
            pageNumber: page.pageNumber,
            hasPageImageUrl: !!page.pageImageUrl,
            pageImageUrl: page.pageImageUrl?.substring(0, 80) || 'MISSING'
          });
        });
      } else {
        console.warn(`[Saga API] ⚠️ Pages is not an array or empty:`, saga.pages);
      }
    } else {
      console.warn(`[Saga API] ⚠️ No pages data in saga`);
    }
    console.log(`[Saga API] =========================================`);

    return NextResponse.json(saga, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error: any) {
    console.error(`[Saga API] Unexpected error for ${sagaId}:`, error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

