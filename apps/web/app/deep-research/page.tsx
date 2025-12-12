"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import DeepResearchModal from "@/components/DeepResearchModal";
import SpeedClickGame from "@/components/SpeedClickGame";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";

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
  const [tokenMint, setTokenMint] = useState("");
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [hasNFT, setHasNFT] = useState<boolean | null>(null);

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
      fetchAnalysisHistory();
      checkNFT();
    }
  }, [isConnected, address]);

  // Refresh pricing info periodically to check for free tickets
  useEffect(() => {
    if (isConnected && address) {
      const interval = setInterval(() => {
        fetchPricingInfo();
      }, 10000); // Refresh every 10 seconds to catch new free tickets
      
      return () => clearInterval(interval);
    }
  }, [isConnected, address]);

  // Check NFT ownership
  const checkNFT = async () => {
    if (!address) return;
    try {
      const nftOwnership = await checkNFTOwnershipClientSide(address);
      setHasNFT(nftOwnership);
    } catch (error) {
      console.error("Error checking NFT:", error);
      setHasNFT(false);
    }
  };

  // Fetch analysis history
  const fetchAnalysisHistory = async () => {
    if (!address) return;
    
    setLoadingHistory(true);
    try {
      // Normalize wallet address to lowercase for consistent querying
      const normalizedAddress = address.toLowerCase();
      const response = await fetch(`/api/deep-research/history?userWallet=${normalizedAddress}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setAnalysisHistory(data.analyses || []);
      }
    } catch (error) {
      console.error("Error fetching analysis history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPricingInfo = async () => {
    if (!address) return;

    console.log("💰 Fetching pricing info for address:", address);
    setLoadingPricing(true);
    try {
      const response = await fetch(
        `/api/deep-research/create?userWallet=${address}`
      );

      console.log("📊 Pricing API response:", { status: response.status, ok: response.ok });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Pricing data received:", data);
        setPricingInfo(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ Pricing API error:", errorData);
      }
    } catch (error) {
      console.error("❌ Error fetching pricing info:", error);
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

  const handleStartAnalysis = () => {
    if (!tokenMint.trim()) {
      alert("Please enter a token mint address");
      return;
    }
    setShowModal(true);
  };

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
                <p className="text-xs text-gray-500">Connected</p>
                <p className="text-sm font-mono">
                  {address.substring(0, 6)}...{address.substring(address.length - 4)}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Hero Section */}
        <div className="mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Uncover Hidden Insights
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            Get comprehensive AI analysis of any Solana token with 10,000+ swap transactions, 
            whale tracking, and market sentiment.
          </p>
          {/* Solana Network Warning */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
              ⚠️ Important: Solana Network Only
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              This analysis tool only supports tokens on the Solana network. Please enter a Solana token mint address.
            </p>
          </div>
        </div>

        {/* Token Input Section */}
        {!isConnected ? (
          <div className="p-8 border border-gray-300 dark:border-gray-700 rounded-lg text-center">
            <p className="text-lg mb-2">Connect your wallet to get started</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Phantom, Solflare, and other Solana wallets supported
            </p>
          </div>
        ) : (
          <>
            {/* Pricing Info */}
            {!loadingPricing && pricingInfo && (
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {/* NFT Holder Pricing */}
                <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-2">NFT Holder</h3>
                  <p className="text-3xl font-bold mb-1">$0.20</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    per analysis
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <li>60% discount</li>
                    <li>Priority support</li>
                    <li>All features included</li>
                  </ul>
                </div>

                {/* Standard Pricing */}
                <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-2">Standard</h3>
                  <p className="text-3xl font-bold mb-1">$0.50</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    per analysis
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <li>10,000 swap analysis</li>
                    <li>AI-powered insights</li>
                    <li>Whale tracking</li>
                    <li>Full report access</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Trial Pricing Banner */}
            {pricingInfo?.trialPricing?.active && (
              <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="font-semibold mb-1">Testing Period Active</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  $0.001 USDC per analysis until {new Date(pricingInfo.trialPricing.endDate).toLocaleDateString()}
                  <br />
                  <span className="text-xs">
                    This tests the payment system - normal prices apply after trial period
                  </span>
                </p>
              </div>
            )}

            {/* Global Weekly Limit */}
            {pricingInfo?.limitInfo && (
              <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold">Platform Capacity</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pricingInfo.limitInfo.current} / {pricingInfo.limitInfo.limit} reports generated this week
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {pricingInfo.limitInfo.remaining}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      remaining
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-black dark:bg-white h-2 rounded-full transition-all"
                    style={{
                      width: `${(pricingInfo.limitInfo.current / pricingInfo.limitInfo.limit) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  This is a shared platform limit across all users. Limit resets every Sunday.
                </p>
              </div>
            )}

            {/* Speed Click Game Section (NFT Owners Only) */}
            {hasNFT && (
              <div className="mb-8">
                <SpeedClickGame
                  onFreeTicketWon={() => {
                    // When free ticket is won, show a message
                    alert("🎉 Congratulations! You won a free analysis ticket! You can now start an analysis without payment.");
                  }}
                />
              </div>
            )}

            {/* Token Input */}
            {pricingInfo?.limitInfo?.remaining === 0 ? (
              <div className="p-8 border-2 border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                <p className="text-lg font-semibold mb-2">Platform Capacity Reached</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  The platform has reached its weekly limit of {pricingInfo.limitInfo.limit} reports.
                  <br />
                  Capacity resets every Sunday at midnight UTC.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Token Mint Address
                  </label>
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder="e.g. C2omVhcvt3DDY77S2KZzawFJQeETZofgZ4eNWWkXpump"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Enter the Solana token mint address you want to analyze
                  </p>
                </div>

                <button
                  onClick={handleStartAnalysis}
                  disabled={!tokenMint.trim()}
                  className="w-full px-6 py-4 bg-black dark:bg-white text-white dark:text-black text-lg font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start Analysis
                </button>
              </div>
            )}
          </>
        )}

        {/* Analysis History Section */}
        {isConnected && address && (
          <div className="mt-16 pt-16 border-t border-gray-200 dark:border-gray-800">
            <h2 className="text-2xl font-bold mb-6">Your Analysis History</h2>
            
            {loadingHistory ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                Loading your analyses...
              </div>
            ) : analysisHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                No analyses yet. Start your first analysis above!
              </div>
            ) : (
              <div className="space-y-4">
                {analysisHistory.map((analysis: any) => {
                  const report = analysis.analysisReport || {};
                  const riskScore = analysis.riskScore || report?.riskScore || report?.riskScoreBreakdown?.totalScore || null;
                  
                  return (
                    <div
                      key={analysis.id}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedAnalysis({
                          analysisResult: report,
                          riskScore: typeof riskScore === 'number' ? riskScore : (riskScore ? parseInt(riskScore) : 0),
                        });
                        setShowModal(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                              {analysis.poolId?.substring(0, 8)}...{analysis.poolId?.substring(analysis.poolId.length - 6)}
                            </span>
                            {riskScore !== null && (
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                riskScore <= 20 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                riskScore <= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                riskScore <= 60 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                riskScore <= 80 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-100'
                              }`}>
                                Risk: {riskScore}/100
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(analysis.generatedAt).toLocaleString()}
                          </p>
                        </div>
                        <button className="text-sm font-semibold text-black dark:text-white hover:underline">
                          View Report →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-16 pt-16 border-t border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold mb-2">10,000+ Swaps</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Deep dive into transaction history with comprehensive swap data
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">AI Analysis</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Powered by Claude AI for intelligent market insights
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Whale Tracking</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Identify and track large holders and their trading patterns
            </p>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <DeepResearchModal
          onClose={() => setShowModal(false)}
          userWallet={address ? address.toLowerCase() : ""}
          pricingInfo={pricingInfo}
          tokenMint={tokenMint}
          onAnalysisComplete={() => {
            // Don't close modal - just refresh data
            fetchPricingInfo(); // Refresh limits
            fetchAnalysisHistory(); // Refresh history
          }}
          selectedAnalysis={selectedAnalysis}
        />
      )}
    </div>
  );
}
