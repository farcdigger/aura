"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import DeepResearchModal from "@/components/DeepResearchModal";

// WHITELIST: Only these addresses can access Deep Research
const WHITELIST_ADDRESSES = [
  "0xedf8e693b3ab4899a03ab22edf90e36a6ac1fd9d", // Admin wallet
];

export default function DeepResearchPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pricingInfo, setPricingInfo] = useState<any>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);

  // Check whitelist access
  useEffect(() => {
    if (isConnected && address) {
      const isWhitelisted = WHITELIST_ADDRESSES.some(
        (whitelisted) => whitelisted.toLowerCase() === address.toLowerCase()
      );

      if (!isWhitelisted) {
        console.log("❌ Access denied: Not in whitelist");
        router.push("/"); // Redirect to home
      }
    }
  }, [isConnected, address, router]);

  // Fetch pricing info when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      fetchPricingInfo();
    }
  }, [isConnected, address]);

  const fetchPricingInfo = async () => {
    if (!address) return;

    setLoadingPricing(true);
    try {
      const response = await fetch(
        `/api/deep-research/create?userWallet=${address}`
      );

      if (response.ok) {
        const data = await response.json();
        setPricingInfo(data);
      }
    } catch (error) {
      console.error("Error fetching pricing info:", error);
    } finally {
      setLoadingPricing(false);
    }
  };

  // Check if user is whitelisted
  const isWhitelisted = address
    ? WHITELIST_ADDRESSES.some(
        (whitelisted) => whitelisted.toLowerCase() === address.toLowerCase()
      )
    : false;

  // Don't render anything if not whitelisted
  if (isConnected && !isWhitelisted) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-400">
            This page is currently in private beta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Deep Research on Solana
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                AI-powered liquidity analysis for Solana tokens
              </p>
            </div>
            {isConnected && address && (
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Connected
                </p>
                <p className="text-sm font-mono">
                  {address.substring(0, 6)}...{address.substring(address.length - 4)}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Uncover Hidden Insights
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Get comprehensive AI analysis of any Solana token with 10,000+ swap
            transactions, whale tracking, and market sentiment.
          </p>
        </div>

        {/* Pricing Cards */}
        {!loadingPricing && pricingInfo && (
          <div className="grid md:grid-cols-2 gap-6 mb-12 max-w-4xl mx-auto">
            {/* Free Trial Card */}
            {pricingInfo.freeTrial?.active && (
              <div className="border-2 border-green-500 rounded-lg p-6 bg-green-50 dark:bg-green-950">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">🎉 Free Trial</h3>
                  <span className="px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full">
                    ACTIVE
                  </span>
                </div>
                <p className="text-3xl font-bold mb-2">FREE</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Until {new Date(pricingInfo.freeTrial.endDate).toLocaleDateString()}
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center">
                    <span className="mr-2">✓</span>
                    10,000 swap analysis
                  </li>
                  <li className="flex items-center">
                    <span className="mr-2">✓</span>
                    AI-powered insights
                  </li>
                  <li className="flex items-center">
                    <span className="mr-2">✓</span>
                    Whale tracking
                  </li>
                  <li className="flex items-center">
                    <span className="mr-2">✓</span>
                    No payment required
                  </li>
                </ul>
              </div>
            )}

            {/* NFT Holder Card */}
            <div className={`border-2 rounded-lg p-6 ${
              pricingInfo.pricing?.hasNFT
                ? "border-purple-500 bg-purple-50 dark:bg-purple-950"
                : "border-gray-300 dark:border-gray-700"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">🎨 NFT Holder</h3>
                {pricingInfo.pricing?.hasNFT && (
                  <span className="px-3 py-1 bg-purple-500 text-white text-sm font-semibold rounded-full">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold mb-2">$0.20</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                per analysis
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  60% discount
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  Priority support
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  All features included
                </li>
              </ul>
            </div>

            {/* Standard Card */}
            <div className="border-2 border-gray-300 dark:border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">⚡ Standard</h3>
              </div>
              <p className="text-3xl font-bold mb-2">$0.50</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                per analysis
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  10,000 swap analysis
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  AI-powered insights
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  Whale tracking
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span>
                  Full report access
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Limits Info */}
        {pricingInfo?.limitInfo && (
          <div className="max-w-4xl mx-auto mb-12 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Weekly Limit</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {pricingInfo.limitInfo.current} / {pricingInfo.limitInfo.limit} reports used
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {pricingInfo.limitInfo.remaining}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  remaining
                </p>
              </div>
            </div>
            <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${(pricingInfo.limitInfo.current / pricingInfo.limitInfo.limit) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* CTA Button */}
        <div className="text-center">
          {!isConnected ? (
            <div className="max-w-md mx-auto p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              <p className="text-lg mb-4">Connect your wallet to get started</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We support Phantom, Solflare, and other Solana wallets
              </p>
            </div>
          ) : pricingInfo?.limitInfo?.remaining === 0 ? (
            <div className="max-w-md mx-auto p-6 border-2 border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-950">
              <p className="text-lg font-semibold mb-2">Weekly Limit Reached</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You've used all {pricingInfo.limitInfo.limit} reports this week.
                Limit resets in a few days.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black text-lg font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Start Analysis
            </button>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-2">10,000+ Swaps</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Deep dive into transaction history with comprehensive swap data
            </p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-bold mb-2">AI Analysis</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Powered by Claude AI for intelligent market insights
            </p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">🐋</div>
            <h3 className="text-xl font-bold mb-2">Whale Tracking</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Identify and track large holders and their trading patterns
            </p>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <DeepResearchModal
          onClose={() => setShowModal(false)}
          userWallet={address || ""}
          pricingInfo={pricingInfo}
          onAnalysisComplete={() => {
            setShowModal(false);
            fetchPricingInfo(); // Refresh limits
          }}
        />
      )}
    </div>
  );
}

