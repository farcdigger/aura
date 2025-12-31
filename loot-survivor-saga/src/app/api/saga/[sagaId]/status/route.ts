// src/app/api/saga/[sagaId]/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

// Next.js 14 Route Handler Cache'i tamamen devre dışı bırak
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simple in-memory cache for status (10 second TTL)
const statusCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds

export async function GET(
  req: NextRequest,
  { params }: { params: { sagaId: string } }
) {
  const { sagaId } = params;

  try {
    // Check cache first (ama completed/failed durumunda cache'i bypass et)
    const cached = statusCache.get(sagaId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Cache'deki data'nın status'ünü kontrol et
      if (cached.data.status === 'completed' || cached.data.status === 'failed') {
        // Completed/failed durumunda cache'i bypass et, fresh data çek
        console.log(`[Saga Status] ⚠️ Cache hit for ${sagaId} but status is ${cached.data.status}, bypassing cache...`);
        statusCache.delete(sagaId);
      } else {
        // Pending/generating durumunda cache'i kullan
        return NextResponse.json(cached.data, {
          headers: {
            'Cache-Control': 'no-store, max-age=0, must-revalidate',
            'X-Cache': 'HIT'
          }
        });
      }
    }
    
    // Sadece database'den saga durumunu al (Redis connection oluşturmadan)
    // Progress bilgisi worker tarafından database'e yazılıyor, bu yüzden Redis'e gerek yok
    // ÖNEMLİ: Explicit select kullan (JSONB field'ları dahil)
    const { data: saga, error } = await supabase
      .from('sagas')
      .select('id, game_id, user_wallet, status, story_text, panels, pages, total_panels, total_pages, generation_time_seconds, cost_usd, created_at, completed_at, progress_percent, current_step')
      .eq('id', sagaId)
      .single();

    if (error) {
      console.error('[Saga Status] Database error:', error);
      // PGRST error codes
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Saga not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    if (!saga) {
      return NextResponse.json(
        { error: 'Saga not found' },
        { status: 404 }
      );
    }
    
    // Debug: Raw database response
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

    // Progress bilgisi database'den geliyor (worker tarafından güncelleniyor)
    const progressPercent = (saga as any).progress_percent ?? null;
    const currentStep = (saga as any).current_step || 'initializing';
    
    let progress = { 
      step: currentStep, 
      progress: progressPercent ?? 0
    };
    
    // Fallback: Eğer progress_percent null/undefined ise status'ten hesapla
    if (progressPercent === null || progressPercent === undefined) {
      if (saga.status === 'generating_story') {
        progress = { step: 'generating_story', progress: 30 };
      } else if (saga.status === 'generating_images') {
        progress = { step: 'generating_images', progress: 50 };
      } else if (saga.status === 'rendering') {
        progress = { step: 'rendering', progress: 90 };
      } else if (saga.status === 'completed') {
        progress = { step: 'completed', progress: 100 };
      } else if (saga.status === 'failed') {
        progress = { step: 'failed', progress: 0 };
      } else if (saga.status === 'pending') {
        progress = { step: 'initializing', progress: 10 };
      }
    }
    
    // Completed veya failed durumunda cache'i bypass et (her zaman fresh data)
    if (saga.status === 'completed' || saga.status === 'failed') {
      statusCache.delete(sagaId);
      console.log(`[Saga Status] ✅ Cache cleared for ${sagaId} (status: ${saga.status})`);
      
      // CRITICAL: Eğer status completed ama pages null ise, read-after-write consistency sorunu olabilir
      // Retry mekanizması ile pages'in gerçekten kaydedildiğini doğrula
      if (saga.status === 'completed' && (!saga.pages || saga.pages === null || (Array.isArray(saga.pages) && saga.pages.length === 0))) {
        console.warn(`[Saga Status] ⚠️ Status is completed but pages is null/empty! This might be a read-after-write consistency issue.`);
        console.warn(`[Saga Status] ⚠️ Retrying with exponential backoff...`);
        
        // Exponential backoff ile retry (max 3 deneme, toplam ~3 saniye)
        let retryCount = 0;
        const maxRetries = 3;
        let verifiedPages = null;
        
        while (retryCount < maxRetries && !verifiedPages) {
          const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
          console.log(`[Saga Status] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms...`);
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
              console.log(`[Saga Status] ✅ Pages verified on retry ${retryCount + 1}:`, {
                pagesLength: verifiedPages.length,
                firstPageImageUrl: verifiedPages[0]?.pageImageUrl?.substring(0, 50) + '...' || 'null'
              });
              break;
            }
          }
          
          retryCount++;
        }
        
        if (!verifiedPages) {
          console.error(`[Saga Status] ❌ CRITICAL: Pages still null after ${maxRetries} retries!`);
          console.error(`[Saga Status] ❌ Status is completed but pages is missing. This might indicate a database issue.`);
        } else {
          console.log(`[Saga Status] ✅ Pages verified successfully after retry`);
        }
      }
    }

    const responseData = {
      sagaId,
      status: saga.status,
      progress,
      ...saga
    };
    
    // Cache the response
    statusCache.set(sagaId, {
      data: responseData,
      timestamp: Date.now()
    });
    
    // Clean old cache entries (prevent memory leak)
    if (statusCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of statusCache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          statusCache.delete(key);
        }
      }
    }
    
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'X-Cache': 'MISS'
      }
    });

  } catch (error: any) {
    console.error('[Saga Status] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

