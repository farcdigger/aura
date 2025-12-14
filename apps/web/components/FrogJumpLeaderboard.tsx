"use client";

import { useState, useEffect } from "react";

interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  score: number;
  created_at?: string;
  updated_at?: string;
}

export default function FrogJumpLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  const fetchLeaderboard = async (showLoading: boolean = false) => {
    // Only show loading state on initial load or explicit refresh
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      const response = await fetch("/api/deep-research/frog-jump?leaderboard=true&limit=10", {
        cache: 'no-store' // Ensure fresh data
      });
      if (response.ok) {
        const data = await response.json();
        const newLeaderboard = data.leaderboard || [];
        
        // Deep comparison to prevent unnecessary re-renders
        setLeaderboard((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(newLeaderboard)) {
            return prev; // Return same reference to prevent re-render
          }
          return newLeaderboard;
        });
        
        // Mark initial load as complete after first successful fetch
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      }
    } catch (error) {
      if (showLoading) {
        console.error("Error fetching leaderboard:", error);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchLeaderboard(true); // Initial load with loading state
    // Refresh every 60 seconds (reduced frequency) without loading state
    const interval = setInterval(() => {
      fetchLeaderboard(false); // Silent refresh
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (wallet: string) => {
    navigator.clipboard.writeText(wallet);
    setCopiedWallet(wallet);
    setTimeout(() => setCopiedWallet(null), 2000);
  };

  const formatWallet = (wallet: string) => {
    return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
  };

  return (
    <div className="p-2" style={{ fontFamily: 'MS Sans Serif, sans-serif' }}>
      {/* Windows XP Style Window */}
      <div className="border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 shadow-lg" style={{ background: '#c0c0c0' }}>
        {/* Window Title Bar */}
        <div className="flex items-center justify-between px-1 py-0.5" style={{ 
          background: 'linear-gradient(to bottom, #0054e3 0%, #0066ff 50%, #0054e3 100%)',
          borderBottom: '1px solid #000'
        }}>
          <div className="flex items-center gap-1">
            <span className="text-white text-xs font-bold">🏆</span>
            <span className="text-white text-xs font-bold">FROG JUMP LEADERBOARD</span>
          </div>
          <div className="flex gap-0.5">
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>_</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>□</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>×</button>
          </div>
        </div>

        {/* Window Content */}
        <div className="p-3" style={{ background: '#c0c0c0' }}>
          {loading ? (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: '#000' }}>Loading leaderboard...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: '#000' }}>No scores yet. Be the first to play!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 p-2 border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300 mb-1" style={{ background: '#c0c0c0' }}>
                <div className="col-span-1 text-xs font-bold" style={{ color: '#000' }}>Rank</div>
                <div className="col-span-7 text-xs font-bold" style={{ color: '#000' }}>Wallet Address</div>
                <div className="col-span-4 text-xs font-bold text-right" style={{ color: '#000' }}>Score</div>
              </div>

              {/* Entries */}
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className="grid grid-cols-12 gap-2 p-2 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 hover:bg-gray-200 transition-colors"
                  style={{ background: '#fff' }}
                >
                  <div className="col-span-1 text-xs font-bold flex items-center" style={{ color: '#000' }}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </div>
                  <div 
                    className="col-span-7 text-xs font-mono flex items-center cursor-pointer hover:underline"
                    style={{ color: '#0000ff' }}
                    onClick={() => handleCopy(entry.wallet_address)}
                    title="Click to copy"
                  >
                    {copiedWallet === entry.wallet_address ? 'Copied!' : formatWallet(entry.wallet_address)}
                  </div>
                  <div className="col-span-4 text-xs font-bold text-right flex items-center justify-end" style={{ color: '#000' }}>
                    {entry.score.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Refresh Button */}
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => fetchLeaderboard(true)}
              disabled={loading}
              className="px-4 py-1 text-xs font-bold transition-all"
              style={{
                fontFamily: 'MS Sans Serif, sans-serif',
                background: loading ? '#808080' : '#c0c0c0',
                color: loading ? '#808080' : '#000',
                border: '2px solid',
                borderTopColor: loading ? '#808080' : '#fff',
                borderLeftColor: loading ? '#808080' : '#fff',
                borderRightColor: loading ? '#606060' : '#808080',
                borderBottomColor: loading ? '#606060' : '#808080',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
              }}
              onMouseDown={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderTopColor = '#808080';
                  e.currentTarget.style.borderLeftColor = '#808080';
                  e.currentTarget.style.borderRightColor = '#fff';
                  e.currentTarget.style.borderBottomColor = '#fff';
                  e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                }
              }}
              onMouseUp={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderTopColor = '#fff';
                  e.currentTarget.style.borderLeftColor = '#fff';
                  e.currentTarget.style.borderRightColor = '#808080';
                  e.currentTarget.style.borderBottomColor = '#808080';
                  e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                }
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

