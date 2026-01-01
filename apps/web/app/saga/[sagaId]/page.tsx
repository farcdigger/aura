'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

interface ComicPage {
  pageNumber: number;
  pageImageUrl?: string;
  pageDescription?: string;
  panels?: Array<{
    panelNumber: number;
    narration?: string;
    speechBubble?: string;
  }>;
}

type SagaStatus = 'pending' | 'generating_story' | 'generating_images' | 'rendering' | 'completed' | 'failed';

interface Saga {
  id: string;
  game_id: string;
  status: SagaStatus;
  story_text?: string;
  pages?: ComicPage[];
  total_pages?: number;
  progress_percent?: number;
  current_step?: string;
  generation_time_seconds?: number;
  cost_usd?: number;
}

export default function SagaViewerPage() {
  const params = useParams();
  const sagaId = params.sagaId as string;
  const [saga, setSaga] = useState<Saga | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSaga = async () => {
    try {
      const url = `/api/saga/${sagaId}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to fetch saga');
      }
      const data = await res.json();
      setSaga(data);
      
      // If saga is completed or failed, stop polling
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      const url = `/api/saga/${sagaId}/status`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to fetch status');
      }
      const statusData = await res.json();
      
      console.log('[SagaViewer] Status poll result:', { 
        status: statusData.status, 
        progress: statusData.progress_percent,
        hasPages: !!statusData.pages,
        pagesLength: statusData.pages?.length 
      });
      
      // Update saga with status data
      setSaga((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: statusData.status,
          progress_percent: statusData.progress_percent || 0,
          current_step: statusData.current_step,
          story_text: statusData.story_text || prev.story_text,
          total_pages: statusData.total_pages || prev.total_pages,
          pages: statusData.pages || prev.pages
        };
      });

      // IMPORTANT: If pages are available in status response, use them immediately
      // This handles Supabase read-after-write consistency
      if (statusData.pages && Array.isArray(statusData.pages) && statusData.pages.length > 0) {
        console.log(`[SagaViewer] ✅ Pages found in status response (${statusData.pages.length} pages)`);
        setSaga((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: statusData.pages,
            status: statusData.status
          };
        });
      }

      // If completed, fetch full saga data immediately
      if (statusData.status === 'completed' || statusData.status === 'failed') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        // Fetch full saga data with retry if pages is null
        let retryCount = 0;
        const maxRetries = 5;
        while (retryCount < maxRetries) {
          await fetchSaga();
          // Check if pages are now available
          const fullSagaRes = await fetch(`/api/saga/${sagaId}`, { cache: 'no-store' });
          if (fullSagaRes.ok) {
            const fullSaga = await fullSagaRes.json();
            if (fullSaga.pages && fullSaga.pages.length > 0) {
              setSaga(fullSaga);
              console.log('[SagaViewer] ✅ Full saga data loaded with pages');
              break;
            }
          }
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`[SagaViewer] Pages not available yet, retrying... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
    } catch (err: any) {
      console.error('[SagaViewer] Status poll error:', err);
    }
  };

  useEffect(() => {
    if (sagaId) {
      fetchSaga();
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [sagaId]);

  // Start polling if saga is pending or generating
  useEffect(() => {
    if (saga && (saga.status === 'pending' || saga.status === 'generating_story' || saga.status === 'generating_images' || saga.status === 'rendering')) {
      // Start polling every 2 seconds
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(pollStatus, 2000);
      }
    } else {
      // Stop polling if saga is completed or failed
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [saga?.status]);

  // Auto-trigger worker if saga is generating (every 15 seconds to avoid rate limits)
  useEffect(() => {
    if (!saga || (saga.status !== 'pending' && saga.status !== 'generating_story' && saga.status !== 'generating_images' && saga.status !== 'rendering')) {
      return;
    }

    const triggerWorker = async () => {
      try {
        await fetch('/api/saga/process', { method: 'POST' });
      } catch (err) {
        console.error('[SagaViewer] Failed to trigger worker:', err);
      }
    };
    
    // Trigger worker immediately, then every 30 seconds (reduced frequency to avoid Replicate rate limits)
    // Replicate free tier: 6 requests/minute = 10s/request minimum
    // We use 30s to be safe and avoid hitting rate limits
    triggerWorker();
    const interval = setInterval(triggerWorker, 30000);
    
    return () => clearInterval(interval);
  }, [saga?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading saga...</p>
        </div>
      </div>
    );
  }

  if (error || !saga) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center bg-white border-2 border-black p-8 shadow-lg">
          <p className="text-black text-xl mb-4 font-bold">Error</p>
          <p className="text-gray-700">{error || 'Saga not found'}</p>
        </div>
      </div>
    );
  }

  // Show generating screen with progress
  if (saga.status === 'pending' || saga.status === 'generating_story' || saga.status === 'generating_images' || saga.status === 'rendering') {
    const progress = saga.progress_percent || 0;
    const stepMessages: Record<string, string> = {
      'pending': 'Initializing...',
      'generating_story': 'Generating story...',
      'generating_images': 'Creating comic pages...',
      'rendering': 'Finalizing...'
    };
    const currentMessage = stepMessages[saga.current_step || 'pending'] || 'Generating saga...';

    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-black mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-black mb-4">{currentMessage}</h2>
          <p className="text-gray-600 text-sm mb-6">This may take a few minutes</p>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 border-2 border-black rounded-none h-8 mb-2 overflow-hidden">
            <div 
              className="bg-black h-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(progress, 99)}%` }}
            />
          </div>
          <p className="text-black text-sm font-semibold">{Math.min(progress, 99)}%</p>
          
          {saga.current_step && (
            <p className="text-gray-500 text-xs mt-2 uppercase tracking-wide">{saga.current_step}</p>
          )}
          
          {/* Warning if stuck */}
          {progress >= 100 && (
            <p className="text-orange-600 text-xs mt-4 italic">Processing may be delayed. Please wait...</p>
          )}
        </div>
      </div>
    );
  }

  // If completed but no pages yet, show loading
  if (saga.status === 'completed' && (!saga.pages || saga.pages.length === 0)) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-black mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-black mb-4">Loading saga...</h2>
          <p className="text-gray-600 text-sm mb-6">Finalizing pages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white p-6 border-b-4 border-gray-800">
        <div className="max-w-5xl mx-auto">
          <h1 
            className="text-4xl md:text-5xl font-bold mb-2" 
            style={{ 
              fontFamily: 'var(--font-cinzel), "Old English Text MT", serif',
              textShadow: '2px 2px 0px rgba(0,0,0,0.5)'
            }}
          >
            {saga.story_text || 'Loot Survivor Saga'}
          </h1>
          <p className="text-gray-300 text-sm">
            Game ID: {saga.game_id} • {saga.total_pages || 0} pages
            {saga.generation_time_seconds && ` • ${Math.round(saga.generation_time_seconds)}s`}
            {saga.cost_usd && ` • $${saga.cost_usd.toFixed(4)}`}
          </p>
        </div>
      </div>

      {/* Comic Pages */}
      <div className="max-w-5xl mx-auto p-6 space-y-12">
        {saga.pages && saga.pages.length > 0 ? (
          saga.pages.map((page, pageIndex) => (
            <div key={page.pageNumber || pageIndex} className="bg-white border-4 border-black shadow-lg">
              {/* Page Image */}
              {page.pageImageUrl ? (
                <div className="relative w-full aspect-square overflow-hidden border-b-2 border-black bg-white">
                  <Image
                    src={page.pageImageUrl}
                    alt={`Comic Page ${page.pageNumber || pageIndex + 1}`}
                    fill
                    className="object-contain"
                    priority={pageIndex < 2}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full aspect-square bg-gray-100 border-b-2 border-black flex items-center justify-center">
                  <p className="text-gray-400">Page {page.pageNumber || pageIndex + 1} - Image loading...</p>
                </div>
              )}

              {/* Page Description */}
              {page.pageDescription && (
                <div className="p-4 bg-gray-50 border-t-2 border-black">
                  <p className="text-black text-base leading-relaxed font-semibold italic">
                    {page.pageDescription}
                  </p>
                </div>
              )}

              {/* Panel Narrations */}
              {page.panels && page.panels.length > 0 && (
                <div className="p-6 bg-white space-y-4 border-t-2 border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    {page.panels.map((panel) => (
                      <div key={panel.panelNumber} className="bg-white border-2 border-black p-4">
                        <p className="text-black text-sm leading-relaxed font-medium">
                          <span className="font-bold text-xs uppercase tracking-wide">Panel {panel.panelNumber}:</span>{' '}
                          {(panel as any).speechBubble || panel.narration || '...'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">No pages available yet. The saga is still being generated.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black text-white p-6 mt-12 border-t-4 border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-300 text-sm">
            Generated by Loot Survivor Saga
          </p>
        </div>
      </div>
    </div>
  );
}

