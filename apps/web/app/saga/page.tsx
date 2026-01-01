'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWalletClient } from 'wagmi';
import { wrapFetchWithPayment } from 'x402-fetch';
import Link from 'next/link';

interface SagaListItem {
  id: string;
  game_id: string;
  status: string;
  story_text?: string;
  total_pages?: number;
  created_at: string;
  completed_at?: string;
}

export default function SagaPage() {
  const [gameId, setGameId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sagaHistory, setSagaHistory] = useState<SagaListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Fetch saga history when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      fetchSagaHistory();
    }
  }, [isConnected, address]);

  // Also fetch when page becomes visible (e.g., returning from saga viewer)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected && address) {
        fetchSagaHistory();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, address]);

  const fetchSagaHistory = async () => {
    if (!address) return;
    
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/saga/list?wallet=${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        setSagaHistory(data.sagas || []);
      }
    } catch (err) {
      console.error('Failed to fetch saga history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!isConnected || !address || !walletClient) {
      setError('Please connect your wallet first');
      setLoading(false);
      return;
    }

    try {
      // Calculate USDC amount (0.5 USDC = 500000 with 6 decimals)
      const amountInUSDC = 500000;
      
      // Wrap fetch with x402 payment handling
      // @ts-ignore - viem version mismatch between dependencies
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient, BigInt(amountInUSDC));

      const sagaApiUrl = '/api/saga/generate';
      
      // x402-fetch automatically handles the entire payment flow
      const res = await fetchWithPayment(sagaApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate saga');
      }

      const data = await res.json();
      // Redirect to saga viewer
      const sagaViewerUrl = `/saga/${data.sagaId}`;
      router.push(sagaViewerUrl);
    } catch (err: any) {
      console.error('Saga generation error:', err);
      setError(err.message || 'Failed to generate saga. Please ensure you have sufficient USDC balance (0.5 USDC required).');
    } finally {
      setLoading(false);
    }
  };

  // Show connect wallet message if not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-50 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Connect Wallet
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please connect your wallet to generate a saga. Saga generation costs 0.5 USDC.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Comic Book Background Pattern (Subtle) */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, black 10px, black 11px)`,
        }}
      />
      
      {/* Back to Home Button */}
      <Link
        href="/"
        className="fixed top-4 left-4 z-50 inline-flex items-center gap-2 px-4 py-2 bg-white border-4 border-black hover:bg-gray-50 transition-all"
        style={{
          fontFamily: 'Georgia, serif',
          boxShadow: '4px 4px 0px rgba(0,0,0,1)',
          textShadow: '1px 1px 0px rgba(0,0,0,0.2)'
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="font-bold text-black">Back to Home</span>
      </Link>
      
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20 relative z-10">
        {/* Header - Comic Book Style */}
        <div className="text-center mb-12">
          {/* Comic Book Panel Border */}
          <div className="bg-white border-4 border-black p-8 mb-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-[-0.5deg]">
            <h1 
              className="text-6xl md:text-7xl font-bold text-black mb-4 tracking-tight" 
              style={{ 
                fontFamily: 'var(--font-cinzel), "Old English Text MT", serif',
                letterSpacing: '0.05em',
                textShadow: '4px 4px 0px rgba(0,0,0,0.3), 8px 8px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.4)',
                transform: 'rotate(0.5deg)',
                WebkitTextStroke: '1px rgba(0,0,0,0.1)'
              }}
            >
              LOOT SURVIVOR
              <br />
              <span className="text-5xl md:text-6xl">SAGA</span>
            </h1>
          </div>
          
          {/* Subtitle with Comic Style */}
          <div className="bg-white border-2 border-black px-6 py-3 inline-block transform rotate-[0.5deg] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p 
              className="text-gray-800 text-lg md:text-xl font-semibold" 
              style={{ 
                fontFamily: 'Georgia, serif',
                textShadow: '2px 2px 0px rgba(0,0,0,0.2), 1px 1px 2px rgba(0,0,0,0.3)'
              }}
            >
              Transform your on-chain game data into an epic comic story
            </p>
          </div>
        </div>

        {/* Form - Comic Book Panel Style */}
        <div className="bg-white border-4 border-black p-8 md:p-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transform rotate-[0.3deg]">
          <form onSubmit={handleGenerate} className="space-y-6">
            <div>
              <label 
                className="block text-black mb-3 font-bold text-lg uppercase tracking-wide" 
                style={{ 
                  fontFamily: 'Georgia, serif',
                  textShadow: '2px 2px 0px rgba(0,0,0,0.2), 1px 1px 2px rgba(0,0,0,0.3)'
                }}
              >
                Game ID
              </label>
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="133595"
                required
                className="w-full bg-white border-4 border-black px-5 py-4 text-black placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-black focus:ring-offset-2 text-lg font-semibold"
                style={{ 
                  fontFamily: 'Georgia, serif',
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1), 4px 4px 0px rgba(0,0,0,1)',
                  textShadow: '1px 1px 0px rgba(0,0,0,0.1)'
                }}
              />
              <p 
                className="text-gray-600 text-sm mt-2 italic" 
                style={{ 
                  fontFamily: 'Georgia, serif',
                  textShadow: '1px 1px 0px rgba(255,255,255,0.8)'
                }}
              >
                Enter Game ID (e.g., 133595)
              </p>
            </div>

            {error && (
              <div className="bg-white border-4 border-black p-4 transform rotate-[-0.5deg]" style={{
                boxShadow: '4px 4px 0px rgba(0,0,0,1)'
              }}>
                <p 
                  className="text-black font-semibold" 
                  style={{ 
                    fontFamily: 'Georgia, serif',
                    textShadow: '1px 1px 0px rgba(0,0,0,0.2)'
                  }}
                >
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 border-4 border-black transition-all text-xl uppercase tracking-wider transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none"
              style={{ 
                fontFamily: 'Georgia, serif',
                boxShadow: loading 
                  ? '4px 4px 0px rgba(0,0,0,0.3)' 
                  : '6px 6px 0px rgba(0,0,0,1), inset 0 0 0 2px rgba(255,255,255,0.1)',
                textShadow: '2px 2px 0px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.8)'
              }}
            >
              {loading ? 'Generating...' : 'Generate Saga'}
            </button>

            {/* Cost Information */}
            <p 
              className="text-center text-gray-600 text-sm mt-4" 
              style={{ 
                fontFamily: 'Georgia, serif',
                textShadow: '1px 1px 0px rgba(255,255,255,0.8)'
              }}
            >
              Cost: 0.5 USDC
            </p>
          </form>
        </div>

        {/* Info - Comic Book Style */}
        <div 
          className="mt-10 text-center text-gray-700 text-sm md:text-base" 
          style={{ 
            fontFamily: 'Georgia, serif',
            textShadow: '1px 1px 0px rgba(255,255,255,0.8), 0 0 2px rgba(0,0,0,0.1)'
          }}
        >
          <p className="italic">Your saga will be generated using AI-powered story and image generation</p>
        </div>

        {/* Saga History Section */}
        {isConnected && address && (
          <div className="mt-16 bg-white border-4 border-black p-8 md:p-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transform rotate-[-0.2deg]">
            <h2 
              className="text-3xl md:text-4xl font-bold text-black mb-6 text-center uppercase tracking-wide"
              style={{ 
                fontFamily: 'Georgia, serif',
                textShadow: '2px 2px 0px rgba(0,0,0,0.2), 1px 1px 2px rgba(0,0,0,0.3)'
              }}
            >
              Your Saga History
            </h2>

            {loadingHistory ? (
              <div className="text-center py-8">
                <p className="text-gray-600">Loading your sagas...</p>
              </div>
            ) : sagaHistory.length === 0 ? (
              <div className="text-center py-8">
                <p 
                  className="text-gray-600 italic"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  No sagas yet. Generate your first saga above!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sagaHistory.map((saga) => (
                  <Link
                    key={saga.id}
                    href={`/saga/${saga.id}`}
                    className="block bg-white border-4 border-black p-6 hover:bg-gray-50 transition-all transform hover:scale-[1.01]"
                    style={{
                      boxShadow: '4px 4px 0px rgba(0,0,0,1)',
                      fontFamily: 'Georgia, serif'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span 
                            className="font-bold text-lg text-black"
                            style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}
                          >
                            Game ID: {saga.game_id}
                          </span>
                          <span 
                            className={`px-3 py-1 text-xs font-bold border-2 border-black ${
                              saga.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : saga.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                            style={{ boxShadow: '2px 2px 0px rgba(0,0,0,1)' }}
                          >
                            {saga.status.toUpperCase()}
                          </span>
                        </div>
                        {saga.story_text && (
                          <p 
                            className="text-gray-700 text-sm mb-2 italic"
                            style={{ textShadow: '1px 1px 0px rgba(255,255,255,0.8)' }}
                          >
                            {saga.story_text}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          {saga.total_pages && (
                            <span>{saga.total_pages} pages</span>
                          )}
                          <span>
                            {new Date(saga.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <span className="text-black font-bold text-xl">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

