"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  points: number;
  total_tokens_spent: number;
  balance: number;
}

interface UserRank {
  rank: number | null;
  points: number;
  total_users: number;
}

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<UserRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  const handleCopy = (wallet: string) => {
    navigator.clipboard.writeText(wallet);
    setCopiedWallet(wallet);
    setTimeout(() => setCopiedWallet(null), 2000);
  };

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/chat/leaderboard?limit=100");
      if (!response.ok) throw new Error("Failed to load leaderboard");
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUserRank = async () => {
    if (!address) {
      setUserRank(null);
      return;
    }

    try {
      const response = await fetch("/api/chat/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (response.ok) {
        const data = await response.json();
        setUserRank(data);
      }
    } catch (err) {
      console.error("Error loading user rank:", err);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    loadUserRank();
  }, [address]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-50 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/40 dark:bg-black/40 backdrop-blur-2xl border-b border-gray-200/30 dark:border-gray-800/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                XFRORA
              </Link>
              <span className="text-sm text-gray-600 dark:text-gray-400 font-light">Leaderboard</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/docs"
                className="hidden md:inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Docs
              </Link>
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 max-w-4xl mx-auto px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-3 tracking-tight">
            Leaderboard
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 font-light">
            Top players ranked by points earned from chat and posts
          </p>
        </div>

        {/* User's Rank Card */}
        {isConnected && address && userRank && (
          <div className="mb-8 p-5 border border-yellow-300/50 dark:border-yellow-700/50 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-xl backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Your Rank</p>
                <p className="text-2xl sm:text-3xl font-bold text-black dark:text-white">
                  {userRank.rank ? `#${userRank.rank}` : "Unranked"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Your Points</p>
                <p className="text-2xl sm:text-3xl font-bold text-black dark:text-white">{userRank.points.toLocaleString()}</p>
              </div>
            </div>
            {userRank.total_users > 0 && (
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
                Out of {userRank.total_users.toLocaleString()} total players
              </p>
            )}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="border border-gray-200/50 dark:border-gray-800/50 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-gray-600 dark:text-gray-400">
              Loading leaderboard...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12 text-gray-600 dark:text-gray-400">
              No players yet. Be the first!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Rank
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Wallet
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Points
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase hidden sm:table-cell">
                      Tokens Spent
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {leaderboard.map((entry) => {
                    const isCurrentUser = isConnected && address && 
                      entry.wallet_address.toLowerCase() === address.toLowerCase();
                    
                    return (
                      <tr
                        key={entry.rank}
                        className={`${
                          isCurrentUser
                            ? "bg-yellow-100/50 dark:bg-yellow-900/30"
                            : "hover:bg-white/30 dark:hover:bg-gray-900/30"
                        } transition-colors`}
                      >
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            {entry.rank <= 3 ? (
                              <span className="text-xl sm:text-2xl">
                                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                              </span>
                            ) : (
                              <span className="text-xs sm:text-sm font-medium text-black dark:text-white">
                                #{entry.rank}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex items-center gap-1.5 sm:gap-2 group">
                            <div className="text-xs sm:text-sm font-medium text-black dark:text-white min-w-0">
                              {isCurrentUser ? (
                                <span className="font-bold">
                                  {entry.wallet_address.slice(0, 4)}...{entry.wallet_address.slice(-4)} <span className="hidden sm:inline">(You)</span>
                                </span>
                              ) : (
                                <span>
                                  {entry.wallet_address.slice(0, 4)}...{entry.wallet_address.slice(-4)}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleCopy(entry.wallet_address)}
                              className="opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 flex-shrink-0"
                              title="Copy full address"
                            >
                              {copiedWallet === entry.wallet_address ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                          <span className="text-xs sm:text-sm font-semibold text-black dark:text-white">
                            {entry.points.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right hidden sm:table-cell">
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            {entry.total_tokens_spent.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 p-5 border border-gray-200/50 dark:border-gray-800/50 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
          <p className="text-sm text-gray-900 dark:text-gray-100 font-light">
            <span className="font-medium">How to earn points:</span> Chat with AI (2000 tokens = 1 point) or create posts (20,000 tokens = 8 points)
          </p>
        </div>
      </main>
    </div>
  );
}
