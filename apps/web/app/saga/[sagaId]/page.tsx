'use client';

import { useState, useEffect } from 'react';
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

interface Saga {
  id: string;
  game_id: string;
  status: string;
  story_text?: string;
  pages?: ComicPage[];
  total_pages?: number;
  generation_time_seconds?: number;
  cost_usd?: number;
}

export default function SagaViewerPage() {
  const params = useParams();
  const sagaId = params.sagaId as string;
  const [saga, setSaga] = useState<Saga | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSaga = async () => {
      try {
        // Use the saga app's API endpoint (same domain)
        // Saga API is on the same domain, so use relative path
        const url = `/api/saga/${sagaId}`;
        
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Failed to fetch saga');
        }
        const data = await res.json();
        setSaga(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (sagaId) {
      fetchSaga();
    }
  }, [sagaId]);

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

  if (saga.status === 'pending' || saga.status === 'processing') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-black text-lg">Generating saga...</p>
          <p className="text-gray-600 text-sm mt-2">This may take a few minutes</p>
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

