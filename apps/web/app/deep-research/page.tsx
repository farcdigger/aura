"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DeepResearchModal from "@/components/DeepResearchModal";
import GameMenu from "@/components/GameMenu";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";

export default function DeepResearchPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pricingInfo, setPricingInfo] = useState<any>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [tokenMint, setTokenMint] = useState("");
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [hasNFT, setHasNFT] = useState<boolean | null>(null);
  const [isGamePlaying, setIsGamePlaying] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<'solana' | 'base' | 'bsc'>('solana');

  // Fetch pricing info when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      setIsInitialLoad(true);
      fetchPricingInfo(true);
      fetchAnalysisHistory();
      checkNFT();
    }
  }, [isConnected, address]);

  // Refresh pricing info periodically to check for free tickets
  // BUT: Don't refresh if a game is currently being played (prevents page jumps)
  // Use silent refresh (no loading state) to prevent layout shifts
  useEffect(() => {
    if (isConnected && address && !isGamePlaying && !isInitialLoad) {
      const interval = setInterval(() => {
        // Double check game is not playing before fetching
        if (!isGamePlaying) {
          fetchPricingInfo(false); // Silent refresh - no loading state
        }
      }, 30000); // Refresh every 30 seconds (reduced frequency to minimize impact)
      
      return () => clearInterval(interval);
    }
  }, [isConnected, address, isGamePlaying, isInitialLoad]);

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

  const fetchPricingInfo = async (showLoading: boolean = false) => {
    if (!address) return;

    // Only show loading state on initial load or explicit refresh
    if (showLoading) {
      setLoadingPricing(true);
    }

    try {
      const response = await fetch(
        `/api/deep-research/create?userWallet=${address}`,
        { cache: 'no-store' } // Ensure fresh data
      );

      if (response.ok) {
        const data = await response.json();
        
        // Deep comparison to prevent unnecessary re-renders
        setPricingInfo((prev: any) => {
          // Only update if data actually changed
          if (JSON.stringify(prev) === JSON.stringify(data)) {
            return prev; // Return same reference to prevent re-render
          }
          return data;
        });
        
        // Mark initial load as complete after first successful fetch
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ Pricing API error:", errorData);
        // Even on error, mark initial load as complete to show error state
        if (isInitialLoad) {
          setIsInitialLoad(false);
          // Set default pricing info to prevent infinite loading
          setPricingInfo({
            pricing: { priceUSDC: 0.50, hasNFT: false },
            limitInfo: { current: 0, limit: 140, remaining: 140 },
            trialPricing: { active: false },
          });
        }
      }
    } catch (error) {
      console.error("❌ Error fetching pricing info:", error);
      // Even on error, mark initial load as complete to show error state
      if (isInitialLoad) {
        setIsInitialLoad(false);
        // Set default pricing info to prevent infinite loading
        setPricingInfo({
          pricing: { priceUSDC: 0.50, hasNFT: false },
          limitInfo: { current: 0, limit: 140, remaining: 140 },
          trialPricing: { active: false },
        });
      }
    } finally {
      if (showLoading) {
        setLoadingPricing(false);
      }
    }
  };


  const handleStartAnalysis = () => {
    if (!tokenMint.trim()) {
      alert("Please enter a token address");
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
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                ← Back to Home
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">
                  Deep Research on Solana
                </h1>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                  AI-powered liquidity analysis for Solana tokens
                </p>
              </div>
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
              This analysis tool only supports tokens on the Solana network. Please enter a Solana token address.
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
            {/* Always render pricing section to prevent layout shift, show loading only on initial load */}
            <div className="grid md:grid-cols-2 gap-6 mb-8 min-h-[200px]">
              {loadingPricing && isInitialLoad ? (
                <div className="col-span-2 text-center py-8 text-gray-600 dark:text-gray-400">
                  Loading pricing information...
                </div>
              ) : pricingInfo ? (
                <>
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
                </>
              ) : null}
            </div>

            {/* Info Cards - Side by side layout */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Trial Pricing Banner */}
              {pricingInfo?.trialPricing?.active && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="font-semibold text-sm mb-1">Testing Period Active</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    $0.001 USDC per analysis until {new Date(pricingInfo.trialPricing.endDate).toLocaleDateString()}
                  </p>
                </div>
              )}

              {/* Global Weekly Limit */}
              {pricingInfo?.limitInfo && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm">Platform Capacity</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {pricingInfo.limitInfo.current} / {pricingInfo.limitInfo.limit} this week
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">
                        {pricingInfo.limitInfo.remaining}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        remaining
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-black dark:bg-white h-1.5 rounded-full transition-all"
                      style={{
                        width: `${(pricingInfo.limitInfo.current / pricingInfo.limitInfo.limit) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Active Analysis Indicator - Always show, even if 0 */}
              {pricingInfo && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm text-blue-900 dark:text-blue-200">Active Analyses</p>
                      <p className="text-xs text-blue-800 dark:text-blue-300">
                        Processing: {pricingInfo.queueInfo?.active || 0} / {pricingInfo.queueInfo?.maxSize || 4}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-blue-900 dark:text-blue-200">
                        {pricingInfo.queueInfo?.active || 0}/{pricingInfo.queueInfo?.maxSize || 4}
                      </p>
                      {(pricingInfo.queueInfo?.waiting || 0) > 0 && (
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          {pricingInfo.queueInfo.waiting} waiting
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(((pricingInfo.queueInfo?.total || 0) / (pricingInfo.queueInfo?.maxSize || 4)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

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
                    Network
                  </label>
                  <select
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value as 'solana' | 'base' | 'bsc')}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white mb-4"
                  >
                    <option value="solana">Solana</option>
                    <option value="base">Base</option>
                    <option value="bsc">BSC (Binance Smart Chain)</option>
                  </select>
                  
                  <label className="block text-sm font-medium mb-2">
                    Token Address
                  </label>
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder={
                      selectedNetwork === 'solana'
                        ? "e.g. C2omVhcvt3DDY77S2KZzawFJQeETZofgZ4eNWWkXpump"
                        : "e.g. 0x1234567890123456789012345678901234567890"
                    }
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    {selectedNetwork === 'solana'
                      ? "Enter the Solana token address you want to analyze"
                      : selectedNetwork === 'base'
                      ? "Enter the Base token address (0x...) you want to analyze"
                      : "Enter the BSC token address (0x...) you want to analyze"}
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

            {/* Games Section (NFT Owners Only) */}
            {hasNFT && (
              <div className="mt-12 mb-8">
                <GameMenu
                  onFreeTicketWon={() => {
                    // When free ticket is won, show a message
                    alert("🎉 Congratulations! You won a free analysis ticket! You can now start an analysis without payment.");
                  }}
                  onGameStateChange={(playing) => setIsGamePlaying(playing)}
                />
              </div>
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
                  // Get securityScore from multiple possible locations
                  const securityScore = analysis.securityScore || report?.securityScore || report?.analysisResult?.securityScore || null;
                  
                  return (
                    <div
                      key={analysis.id}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedAnalysis({
                          ...report, // Spread the report to include all fields
                          securityScore: securityScore, // Ensure securityScore is at top level
                          analysisResult: report, // Keep nested structure for backward compatibility
                          riskScore: 0, // Kept for backward compatibility
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
                            {securityScore !== null && (
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                securityScore >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                securityScore >= 60 ? 'bg-green-50 text-green-700 dark:bg-green-800 dark:text-green-300' :
                                securityScore >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                securityScore >= 20 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                Security: {securityScore}/100
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
          network={selectedNetwork}
          onAnalysisComplete={() => {
            // Don't close modal - just refresh data
            fetchPricingInfo(true); // Refresh limits with loading state
            fetchAnalysisHistory(); // Refresh history
          }}
          selectedAnalysis={selectedAnalysis}
        />
      )}
    </div>
  );
}
