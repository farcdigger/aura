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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-50 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/40 dark:bg-black/40 backdrop-blur-2xl border-b border-gray-200/30 dark:border-gray-800/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                XFRORA
              </Link>
              <span className="text-sm text-gray-600 dark:text-gray-400 font-light">Referrals</span>
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

      <main className="pt-24 max-w-2xl mx-auto px-6 lg:px-8 py-12">
        <h1 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-6 tracking-tight">
          Invite Friends & Earn Rewards
        </h1>
        
        <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 p-6 rounded-xl mb-8 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
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
              <div className="p-5 border border-gray-200/50 dark:border-gray-800/50 rounded-xl text-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider font-medium">Total Referrals</p>
                <p className="text-3xl font-light text-gray-900 dark:text-gray-50">{stats.totalReferrals}</p>
              </div>
              <div className="p-5 border border-gray-200/50 dark:border-gray-800/50 rounded-xl text-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider font-medium">Credits Earned</p>
                <p className="text-3xl font-light text-green-600 dark:text-green-400">{stats.totalCreditsEarned.toLocaleString()}</p>
              </div>
              <div className="p-5 border border-blue-300/50 dark:border-blue-700/50 rounded-xl text-center bg-blue-100/50 dark:bg-blue-900/30 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider font-medium">USDC Pending</p>
                <p className="text-3xl font-light text-blue-600 dark:text-blue-400">${stats.usdcPending.toFixed(2)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-light">Paid after sale ends</p>
              </div>
              <div className="p-5 border border-gray-200/50 dark:border-gray-800/50 rounded-xl text-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider font-medium">USDC Paid</p>
                <p className="text-3xl font-light text-gray-600 dark:text-gray-400">${stats.usdcPaid.toFixed(2)}</p>
              </div>
            </div>

            {/* Link Generation */}
            <div className="p-6 border border-gray-200/50 dark:border-gray-800/50 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Your Referral Link</h3>
              
              {referralCode ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    readOnly 
                    value={referralLink}
                    className="flex-1 px-4 py-3 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border-2 border-gray-300/50 dark:border-gray-700/50 rounded-xl text-sm text-gray-900 dark:text-gray-100 min-w-0 shadow-sm"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(referralLink)}
                    className="px-5 py-3 bg-white/20 dark:bg-black/20 backdrop-blur-xl text-gray-900 dark:text-gray-100 font-medium rounded-xl border border-gray-300/20 dark:border-gray-700/20 hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-300 whitespace-nowrap shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_15px_50px_rgb(255,255,255,0.12)]"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <button
                  onClick={createCode}
                  disabled={creating}
                  className="w-full py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl text-gray-900 dark:text-gray-100 font-medium rounded-xl border border-gray-300/20 dark:border-gray-700/20 hover:bg-white/30 dark:hover:bg-black/30 disabled:opacity-50 transition-all duration-300 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_15px_50px_rgb(255,255,255,0.12)]"
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

