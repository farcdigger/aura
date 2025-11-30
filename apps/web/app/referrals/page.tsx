"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function ReferralsPage() {
  const { address, isConnected } = useAccount();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    totalCreditsEarned: 0,
    pendingCredits: 0,
    totalUsdcEarned: 0,
    usdcPaid: 0,
    usdcPending: 0,
  });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadStats = async () => {
    if (!address) return;
    setLoading(true);
    try {
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const res = await fetch(`/api/referrals/stats?wallet=${address}&t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      const data = await res.json();
      
      console.log("📊 Referral stats loaded:", data);
      
      if (data.referralCode) {
        setReferralCode(data.referralCode);
      }
      setStats({
        totalReferrals: data.totalReferrals || 0,
        totalCreditsEarned: data.totalCreditsEarned || 0,
        pendingCredits: data.pendingCredits || 0,
        totalUsdcEarned: data.totalUsdcEarned || 0,
        usdcPaid: data.usdcPaid || 0,
        usdcPending: data.usdcPending || 0,
      });
    } catch (error) {
      console.error("Failed to load stats", error);
    } finally {
      setLoading(false);
    }
  };

  const createCode = async () => {
    if (!address) return;
    setCreating(true);
    try {
      const res = await fetch("/api/referrals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      
      if (res.status === 403) {
        alert(data.error || "You must own an xFrora NFT to create a referral link.");
        return;
      }
      
      if (data.code) {
        setReferralCode(data.code);
      }
    } catch (error) {
      console.error("Failed to create code", error);
      alert("Failed to create referral link. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      loadStats();
    }
  }, [address, isConnected]);

  const referralLink = referralCode 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${referralCode}`
    : "";

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/" className="text-lg sm:text-xl font-bold text-black dark:text-white">
                XFRORA
              </Link>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Referrals</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-black dark:text-white mb-6">
          Invite Friends & Earn Rewards
        </h1>
        
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-lg font-semibold text-black dark:text-white mb-4">
            How it works
          </h2>
          <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-2">
              <span className="font-bold text-black dark:text-white">1.</span>
              Share your unique referral link (NFT owners only).
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-black dark:text-white">2.</span>
              Friends mint an NFT using your link.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-black dark:text-white">3.</span>
              You earn <span className="font-bold text-green-600 dark:text-green-400">50,000 Credits</span> instantly + <span className="font-bold text-blue-600 dark:text-blue-400">0.25 USDC</span> per mint!
            </li>
            <li className="flex gap-2">
               <span className="font-bold text-black dark:text-white">4.</span>
               Credits are added instantly. USDC rewards are paid manually after NFT sale ends.
            </li>
          </ul>
        </div>

        {!isConnected ? (
          <div className="text-center py-12">
            <p className="mb-4 text-gray-600 dark:text-gray-400">Connect wallet to view your referral dashboard</p>
          </div>
        ) : loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase mb-1">Total Referrals</p>
                <p className="text-3xl font-bold text-black dark:text-white">{stats.totalReferrals}</p>
              </div>
              <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase mb-1">Credits Earned</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalCreditsEarned.toLocaleString()}</p>
              </div>
              <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg text-center bg-blue-50 dark:bg-blue-900/10">
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase mb-1">USDC Pending</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">${stats.usdcPending.toFixed(2)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Paid after sale ends</p>
              </div>
              <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase mb-1">USDC Paid</p>
                <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">${stats.usdcPaid.toFixed(2)}</p>
              </div>
            </div>

            {/* Link Generation */}
            <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h3 className="font-bold text-black dark:text-white mb-4">Your Referral Link</h3>
              
              {referralCode ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input 
                    readOnly 
                    value={referralLink}
                    className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs sm:text-sm text-black dark:text-white min-w-0"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(referralLink)}
                    className="px-3 sm:px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-semibold rounded hover:opacity-90 text-sm sm:text-base whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <button
                  onClick={createCode}
                  disabled={creating}
                  className="w-full py-2.5 sm:py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded hover:opacity-90 disabled:opacity-50 text-sm sm:text-base"
                >
                  {creating ? "Creating..." : "Generate Referral Link"}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

