// src/app/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [gameId, setGameId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/saga/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate saga');
      }

      const data = await res.json();
      router.push(`/saga/${data.sagaId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Comic Book Background Pattern (Subtle) */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, black 10px, black 11px)`,
        }}
      />
      
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
      </div>
    </div>
  );
}
