// src/components/saga/SagaViewer.tsx

'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { StoryPanel } from '@/types/saga';

interface ComicPage {
  pageNumber: number;
  panels: StoryPanel[];
  pageImageUrl?: string;
}

interface Saga {
  id: string;
  game_id: string;
  user_wallet: string;
  status: string;
  story_text: string;
  panels: StoryPanel[]; // Backward compatibility
  pages?: ComicPage[]; // Comic pages (yeni format)
  total_panels: number;
  total_pages?: number;
  generation_time_seconds?: number;
  cost_usd?: number;
  created_at: string;
  completed_at?: string;
}

interface SagaViewerProps {
  sagaId: string;
}

export function SagaViewer({ sagaId }: SagaViewerProps) {
  const [saga, setSaga] = useState<Saga | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSaga = async () => {
    try {
      const res = await fetch(`/api/saga/${sagaId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch saga');
      }
      const data = await res.json();
      // Debug: Database format kontrolü - DETAYLI
      console.log('[SagaViewer] ========== FETCHED SAGA DATA ==========');
      console.log('[SagaViewer] Basic info:', { 
        id: data.id, 
        status: data.status, 
        panelsCount: data.panels?.length || 0,
        pagesCount: data.pages?.length || data.total_pages || 0,
        hasPanels: !!data.panels,
        hasPages: !!data.pages,
        total_pages: data.total_pages
      });
      
      if (data.pages) {
        console.log('[SagaViewer] Pages structure:', {
          isArray: Array.isArray(data.pages),
          length: data.pages.length,
          type: typeof data.pages
        });
        
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          console.log('[SagaViewer] First page:', {
            pageNumber: data.pages[0]?.pageNumber,
            hasPageImageUrl: 'pageImageUrl' in (data.pages[0] || {}),
            pageImageUrl: data.pages[0]?.pageImageUrl || 'MISSING',
            pageImageUrlPreview: data.pages[0]?.pageImageUrl?.substring(0, 80) || 'null',
            hasPanels: 'panels' in (data.pages[0] || {}),
            panelsCount: data.pages[0]?.panels?.length || 0,
            allKeys: data.pages[0] ? Object.keys(data.pages[0]) : []
          });
          
          // Tüm sayfaları kontrol et
          data.pages.forEach((page: any, index: number) => {
            console.log(`[SagaViewer] Page ${index + 1}:`, {
              pageNumber: page.pageNumber,
              hasPageImageUrl: !!page.pageImageUrl,
              pageImageUrl: page.pageImageUrl?.substring(0, 80) || 'MISSING'
            });
          });
        } else {
          console.warn('[SagaViewer] ⚠️ Pages is not an array or empty:', data.pages);
        }
      } else {
        console.warn('[SagaViewer] ⚠️ No pages data in saga');
      }
      
      console.log('[SagaViewer] =========================================');
      setSaga(data);
    } catch (err: any) {
      console.error('[SagaViewer] Error fetching saga:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSaga();
  }, [sagaId]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !saga) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center bg-white border-2 border-black p-8 shadow-lg">
          <p className="text-black text-xl mb-4 font-bold" style={{ fontFamily: 'var(--font-cinzel), "Old English Text MT", serif' }}>
            Error
          </p>
          <p className="text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
            {error || 'Comic book not found'}
          </p>
        </div>
      </div>
    );
  }

  if (saga.status !== 'completed') {
    return <GeneratingScreen saga={saga} onComplete={(completedSaga) => {
      console.log('[SagaViewer] onComplete callback called with saga:', {
        id: completedSaga.id,
        status: completedSaga.status,
        hasPages: !!completedSaga.pages,
        pagesCount: completedSaga.pages?.length || completedSaga.total_pages || 0
      });
      setSaga(completedSaga);
      setLoading(false);
    }} />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Siyah-Beyaz Header */}
      <div className="bg-black text-white p-6 border-b-4 border-gray-800">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 tracking-tight" style={{ 
            fontFamily: 'var(--font-cinzel), "Old English Text MT", serif',
            letterSpacing: '0.1em'
          }}>
            {saga.story_text}
          </h1>
          <div className="flex items-center gap-4 text-gray-300 text-sm">
            {saga.total_pages && (
              <span className="bg-gray-800 px-3 py-1 rounded border border-gray-700">
                {saga.total_pages} Pages
              </span>
            )}
            <span className="bg-gray-800 px-3 py-1 rounded border border-gray-700">
              {saga.total_panels} Panels
            </span>
            <span>Game ID: {saga.game_id.slice(0, 8)}...</span>
            {saga.generation_time_seconds && (
              <span>• {saga.generation_time_seconds}s</span>
            )}
          </div>
        </div>
      </div>

      {/* Comic Pages - Siyah-Beyaz */}
      <div className="max-w-5xl mx-auto p-6 space-y-12">
        {(() => {
          // Database format: [{"panels": [...]}] - nested structure
          // pages[0].panels okuma mantığı aktif
          let pagesToRender: ComicPage[] = [];
          
          if (saga.pages && saga.pages.length > 0) {
            // Nested format kontrolü: pages[0].panels var mı?
            const firstPage = saga.pages[0] as any;
            console.log('[SagaViewer] ========== RENDERING PAGES ==========');
            console.log('[SagaViewer] First page structure:', {
              hasPageImageUrl: 'pageImageUrl' in (firstPage || {}),
              pageImageUrl: firstPage?.pageImageUrl || 'MISSING',
              pageImageUrlPreview: firstPage?.pageImageUrl?.substring(0, 80) || 'null',
              keys: firstPage ? Object.keys(firstPage) : [],
              fullPage: firstPage
            });
            
            if (firstPage && typeof firstPage === 'object' && 'panels' in firstPage) {
              // Nested format: [{"panels": [...]}] - pages[0].panels okuma mantığı
              pagesToRender = saga.pages.map((page: any, index: number) => {
                const pageData = {
                  pageNumber: page.pageNumber || (index + 1),
                  panels: Array.isArray(page.panels) ? page.panels : [],
                  pageImageUrl: page.pageImageUrl || null,
                  pageDescription: page.pageDescription || null
                };
                console.log(`[SagaViewer] Page ${index + 1} data:`, {
                  pageNumber: pageData.pageNumber,
                  hasImageUrl: !!pageData.pageImageUrl,
                  imageUrl: pageData.pageImageUrl?.substring(0, 50) + '...' || 'null',
                  panelsCount: pageData.panels.length
                });
                return pageData;
              });
            } else if (Array.isArray(saga.pages) && saga.pages.length > 0) {
              // Direct format: [{pageNumber, panels, ...}]
              pagesToRender = saga.pages.map((page: any, index: number) => {
                console.log(`[SagaViewer] Direct format page ${index + 1}:`, {
                  hasPageImageUrl: 'pageImageUrl' in page,
                  pageImageUrl: page.pageImageUrl?.substring(0, 50) + '...' || 'null'
                });
                return page;
              }) as ComicPage[];
            }
          }
          
          // Fallback: Eski format (panels array'inden sayfalar oluştur)
          if (pagesToRender.length === 0 && saga.panels && saga.panels.length > 0) {
            pagesToRender = saga.panels.reduce((acc: ComicPage[], panel, i) => {
              const pageIndex = Math.floor(i / 4);
              if (!acc[pageIndex]) {
                acc[pageIndex] = { pageNumber: pageIndex + 1, panels: [] };
              }
              acc[pageIndex].panels.push(panel);
              return acc;
            }, []);
          }
          
          return pagesToRender;
        })().map((page, pageIndex) => (
          <motion.div
            key={page.pageNumber}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: pageIndex * 0.1 }}
            viewport={{ once: true, margin: '-100px' }}
            className="relative"
          >
            {/* Comic Page Container - Siyah-Beyaz Tarzı */}
            <div className="bg-white border-2 border-black shadow-lg">
              {/* Page Number - Minimal Badge */}
              <div className="absolute -top-3 -left-3 bg-black text-white w-12 h-12 flex items-center justify-center font-bold text-sm border-2 border-black z-10">
                Page {page.pageNumber}
              </div>

              {/* Comic Page Image - Grid Layout (4-5 panel içeren tek görsel) */}
              {(() => {
                if (!page.pageImageUrl) {
                  console.warn(`[SagaViewer] ⚠️ No pageImageUrl for page ${page.pageNumber}`);
                }
                return page.pageImageUrl ? (
                  <div className="relative w-full aspect-square overflow-hidden border-b-2 border-black bg-white">
                    <Image
                      src={page.pageImageUrl}
                      alt={`Comic Page ${page.pageNumber}`}
                      fill
                      className="object-contain"
                      priority={pageIndex < 2}
                      unoptimized
                      onError={(e) => {
                        console.error(`[SagaViewer] Image load error for page ${page.pageNumber}:`, page.pageImageUrl);
                      }}
                      onLoad={() => {
                        console.log(`[SagaViewer] Image loaded successfully for page ${page.pageNumber}`);
                      }}
                    />
                  </div>
                ) : (
                // Fallback: Eski format (her panel ayrı görsel)
                <div className="grid grid-cols-2 gap-2 p-4 border-b-2 border-black">
                  {page.panels.map((panel, panelIndex) => (
                    <div key={panel.panelNumber} className="relative aspect-square">
                      {panel.imageUrl && (
                        <Image
                          src={panel.imageUrl}
                          alt={`Panel ${panel.panelNumber}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                  ))}
                </div>
                );
              })()}

              {/* Page Description - Summary of the page */}
              {page.pageDescription && (
                <div className="p-4 bg-gray-50 border-t-2 border-black">
                  <p 
                    className="text-black text-base leading-relaxed font-semibold italic" 
                    style={{
                      fontFamily: 'Georgia, serif',
                      textShadow: '1px 1px 0px rgba(0,0,0,0.1)'
                    }}
                  >
                    {page.pageDescription}
                  </p>
                </div>
              )}

              {/* Panel Narrations - Below the image (NO speech bubbles in image) */}
              <div className="p-6 bg-white space-y-4 border-t-2 border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  {page.panels.map((panel, panelIndex) => (
                    <div key={panel.panelNumber} className="bg-white border-2 border-black p-4">
                      <p 
                        className="text-black text-sm leading-relaxed font-medium" 
                        style={{
                          fontFamily: 'Georgia, serif',
                          textShadow: '1px 1px 0px rgba(0,0,0,0.1)'
                        }}
                      >
                        <span className="font-bold text-xs uppercase tracking-wide">Panel {panel.panelNumber}:</span>{' '}
                        {(panel as any).speechBubble || panel.narration || '...'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer Actions - Siyah-Beyaz */}
      <div className="bg-black text-white p-6 mt-12 border-t-4 border-gray-800">
        <div className="max-w-4xl mx-auto flex gap-4">
          <ShareButton sagaId={sagaId} />
          <DownloadButton sagaId={sagaId} />
          <MintNFTButton sagaId={sagaId} disabled />
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-4xl mb-4 font-bold" style={{ fontFamily: 'var(--font-cinzel), "Old English Text MT", serif' }}>
          ...
        </div>
        <p className="text-xl font-bold text-black" style={{ fontFamily: 'var(--font-cinzel), "Old English Text MT", serif' }}>
          Preparing comic book...
        </p>
      </div>
    </div>
  );
}

function GeneratingScreen({ saga, onComplete }: { saga: Saga; onComplete?: (saga: Saga) => void }) {
  const [progress, setProgress] = useState<any>(null);
  const pollingRef = useRef<{ active: boolean; timeoutId: NodeJS.Timeout | null }>({ active: false, timeoutId: null });

  useEffect(() => {
    // Eğer zaten polling aktifse, yeni bir tane başlatma
    if (pollingRef.current.active) {
      return;
    }
    
    pollingRef.current.active = true;
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let pollCount = 0;
    const MAX_POLLS = 120; // Max 10 dakika
    
    const checkStatus = async () => {
      if (!isMounted) return;
      
      // Max poll sayısını aştıysak dur
      if (pollCount >= MAX_POLLS) {
        console.warn('[GeneratingScreen] Max poll count reached, stopping');
        return;
      }
      
      pollCount++;
      
      try {
        // Status'ü kontrol et - AbortController ile timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8 saniye timeout
        
        const statusRes = await fetch(`/api/saga/${saga.id}/status`, {
          cache: 'no-store',
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (!statusRes.ok) {
          throw new Error(`Status check failed: ${statusRes.status}`);
        }
        
        const statusData = await statusRes.json();
        
        // Debug: Status data kontrolü - DETAYLI
        console.log('[GeneratingScreen] ========== STATUS CHECK ==========');
        console.log('[GeneratingScreen] Status check:', {
          status: statusData.status,
          hasPages: !!statusData.pages,
          pagesCount: statusData.pages?.length || statusData.total_pages || 0,
          pagesType: typeof statusData.pages,
          total_pages: statusData.total_pages,
          // Full status data
          fullStatusData: statusData
        });
        console.log('[GeneratingScreen] ===================================');
        
        if (isMounted) {
          setProgress(statusData.progress);
        }
        
        // Eğer completed ise, full saga verisini çek ve parent'a bildir
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          console.log('[GeneratingScreen] 🎉 Saga completed! Fetching full saga data...');
          if (!isMounted) return;
          
          // Full saga verisini çek
          const sagaController = new AbortController();
          const sagaTimeout = setTimeout(() => sagaController.abort(), 8000);
          
          const sagaRes = await fetch(`/api/saga/${saga.id}`, {
            cache: 'no-store',
            signal: sagaController.signal
          });
          
          clearTimeout(sagaTimeout);
          
          if (sagaRes.ok && isMounted) {
            const fullSaga = await sagaRes.json();
            
            // Debug: Full saga data kontrolü
            console.log('[GeneratingScreen] ========== SAGA COMPLETED - FETCHED DATA ==========');
            console.log('[GeneratingScreen] Full saga:', {
              id: fullSaga.id,
              status: fullSaga.status,
              hasPages: !!fullSaga.pages,
              pagesCount: fullSaga.pages?.length || fullSaga.total_pages || 0,
              pagesType: typeof fullSaga.pages,
              pagesIsArray: Array.isArray(fullSaga.pages),
              firstPageImageUrl: fullSaga.pages?.[0]?.pageImageUrl?.substring(0, 80) || 'MISSING'
            });
            
            if (fullSaga.pages) {
              console.log('[GeneratingScreen] Pages structure:', {
                isArray: Array.isArray(fullSaga.pages),
                length: fullSaga.pages.length,
                firstPage: fullSaga.pages[0] ? {
                  pageNumber: fullSaga.pages[0].pageNumber,
                  hasPageImageUrl: !!fullSaga.pages[0].pageImageUrl,
                  pageImageUrl: fullSaga.pages[0].pageImageUrl?.substring(0, 80) || 'MISSING'
                } : null
              });
            } else {
              console.warn('[GeneratingScreen] ⚠️ No pages data in completed saga!');
            }
            console.log('[GeneratingScreen] =========================================');
            
            if (onComplete) {
              onComplete(fullSaga);
            } else {
              // Fallback: reload
              window.location.reload();
            }
          } else if (isMounted) {
            // Reload fallback
            window.location.reload();
          }
          return; // Completed, polling'i durdur
        }
        
        // Hala processing - exponential backoff ile tekrar kontrol et
        if (isMounted) {
          // İlk birkaç poll'da daha sık kontrol et (2 saniye), sonra 5 saniye, sonra 10 saniye
          // Worker tamamlandıktan sonra hızlıca algılamak için ilk 10 poll'da 2 saniye
          const delay = pollCount <= 10 ? 2000 : pollCount <= 20 ? 5000 : 10000;
          console.log(`[GeneratingScreen] Next poll in ${delay}ms (poll count: ${pollCount})`);
          timeoutId = setTimeout(checkStatus, delay);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          console.warn('[GeneratingScreen] Request timeout, retrying...');
        } else {
          console.error('[GeneratingScreen] Failed to fetch progress:', err);
        }
        
        // Hata durumunda da tekrar dene, ama daha uzun aralıkla
        if (isMounted) {
          const delay = pollCount <= 10 ? 10000 : 30000; // 10 saniye veya 30 saniye
          timeoutId = setTimeout(checkStatus, delay);
        }
      }
    };
    
    // İlk kontrol - hemen başla (saga zaten başlamış olabilir)
    checkStatus();
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [saga.id, onComplete]);

  const progressPercent = progress?.progress || 0;
  const step = progress?.step || 'initializing';

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center max-w-md bg-white border-2 border-black p-8 shadow-lg">
        <div className="animate-pulse text-4xl mb-4 font-bold" style={{ fontFamily: 'var(--font-cinzel), "Old English Text MT", serif' }}>
          ...
        </div>
        <h2 className="text-2xl font-bold text-black mb-2" style={{ fontFamily: 'var(--font-cinzel), "Old English Text MT", serif' }}>
          Creating Comic Book
        </h2>
        <p className="text-gray-700 mb-6 capitalize text-base" style={{ fontFamily: 'Georgia, serif' }}>
          {step.replace('_', ' ')}...
        </p>
        
        {/* Progress Bar - Siyah-Beyaz */}
        <div className="w-full bg-gray-200 h-2 mb-4 border border-black">
          <div
            className="bg-black h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
        <p className="text-gray-600 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
          {progressPercent}% • Please wait...
        </p>
      </div>
    </div>
  );
}

// Paylaşım komponenti
function ShareButton({ sagaId }: { sagaId: string }) {
  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/saga/${sagaId}`
    : '';

  const shareToTwitter = () => {
    if (!shareUrl) return;
    const text = encodeURIComponent('Check out my Loot Survivor saga!');
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`,
      '_blank'
    );
  };

  return (
    <button
      onClick={shareToTwitter}
      className="flex-1 bg-white hover:bg-gray-100 text-black px-6 py-3 border-2 border-black font-semibold transition"
      style={{ fontFamily: 'Georgia, serif' }}
    >
      Share
    </button>
  );
}

function DownloadButton({ sagaId }: { sagaId: string }) {
  const download = async () => {
    // PDF generation logic (Gelecek hafta)
    alert('Download feature coming soon!');
  };

  return (
    <button
      onClick={download}
      className="flex-1 bg-white hover:bg-gray-100 text-black px-6 py-3 border-2 border-black font-semibold transition"
      style={{ fontFamily: 'Georgia, serif' }}
    >
      Download
    </button>
  );
}

function MintNFTButton({ sagaId, disabled }: { sagaId: string; disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      className="flex-1 bg-white hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed text-black disabled:text-gray-500 px-6 py-3 border-2 border-black disabled:border-gray-400 font-semibold transition"
      style={{ fontFamily: 'Georgia, serif' }}
    >
      Mint NFT {disabled && '(Coming Soon)'}
    </button>
  );
}

