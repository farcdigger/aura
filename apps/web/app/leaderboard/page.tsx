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
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Navbar */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xl font-bold text-black dark:text-white">
                XFRORA
              </Link>
              <span className="text-sm text-gray-600 dark:text-gray-400">Leaderboard</span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-black dark:text-white mb-2">
            Leaderboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Top players ranked by points earned from chat and posts
          </p>
        </div>

        {/* User's Rank Card */}
        {isConnected && address && userRank && (
          <div className="mb-6 p-4 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Your Rank</p>
                <p className="text-3xl font-bold text-black dark:text-white">
                  {userRank.rank ? `#${userRank.rank}` : "Unranked"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 dark:text-gray-400">Your Points</p>
                <p className="text-3xl font-bold text-black dark:text-white">{userRank.points.toLocaleString()}</p>
              </div>
            </div>
            {userRank.total_users > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Out of {userRank.total_users.toLocaleString()} total players
              </p>
            )}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="border border-gray-200 dark:border-gray-800">
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
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Wallet
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Points
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
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
                            ? "bg-yellow-50 dark:bg-yellow-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-gray-900"
                        } transition-colors`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            {entry.rank <= 3 ? (
                              <span className="text-2xl">
                                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                              </span>
                            ) : (
                              <span className="text-sm font-medium text-black dark:text-white">
                                #{entry.rank}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-black dark:text-white">
                            {isCurrentUser ? (
                              <span className="font-bold">
                                {entry.wallet_address.slice(0, 6)}...{entry.wallet_address.slice(-4)} (You)
                              </span>
                            ) : (
                              <span>
                                {entry.wallet_address.slice(0, 6)}...{entry.wallet_address.slice(-4)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-black dark:text-white">
                            {entry.points.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
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
        <div className="mt-6 p-4 border border-gray-200 dark:border-gray-800">
          <p className="text-sm text-black dark:text-white">
            <strong>How to earn points:</strong> Chat with AI (2000 tokens = 1 point) or create posts (20,000 tokens = 8 points)
          </p>
        </div>
      </main>
    </div>
  );
}
