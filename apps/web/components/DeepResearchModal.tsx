"use client";

import { useState, useEffect } from "react";
import { useWalletClient } from "wagmi";
import { wrapFetchWithPayment } from "x402-fetch";

interface DeepResearchModalProps {
  onClose: () => void;
  userWallet: string;
  pricingInfo: any;
  onAnalysisComplete: () => void;
}

type AnalysisStatus = "input" | "payment" | "processing" | "completed" | "error";

export default function DeepResearchModal({
  onClose,
  userWallet,
  pricingInfo,
  onAnalysisComplete,
}: DeepResearchModalProps) {
  const [tokenMint, setTokenMint] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const { data: walletClient } = useWalletClient();

  // Poll for job status
  useEffect(() => {
    if (status === "processing" && jobId) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/deep-research/status?jobId=${jobId}`);
          if (response.ok) {
            const data = await response.json();
            
            if (data.status === "completed") {
              setAnalysisResult(data.result);
              setStatus("completed");
              setProgress(100);
              clearInterval(interval);
            } else if (data.status === "failed") {
              setError(data.error || "Analysis failed");
              setStatus("error");
              clearInterval(interval);
            } else {
              // Update progress (estimate based on time)
              setProgress(Math.min(95, progress + 5));
            }
          }
        } catch (err) {
          console.error("Error polling status:", err);
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [status, jobId, progress]);

  const handleStartAnalysis = async () => {
    if (!tokenMint.trim()) {
      setError("Please enter a token mint address");
      return;
    }

    // Validate Solana address format
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      setError("Invalid Solana token mint address");
      return;
    }

    setError(null);

    // Check if payment is required (now always required, but might be trial pricing)
    const isFree = false; // Always require payment (even if $0.001 during trial)

    if (!isFree) {
      setStatus("payment");
      return;
    }

    // Start analysis (free)
    await startAnalysis();
  };

  const handlePayment = async () => {
    if (!walletClient) {
      setError("Wallet client not available. Please reconnect your wallet.");
      return;
    }

    setStatus("processing");
    setProgress(5);

    try {
      // Calculate USDC amount (6 decimals)
      const priceUSD = pricingInfo?.pricing?.priceUSDC || 0.50;
      const amountInUSDC = Math.floor(priceUSD * 1_000_000);

      console.log("💰 Starting x402 payment:", {
        priceUSD,
        amountInUSDC,
        hasNFT: pricingInfo?.pricing?.hasNFT,
      });

      // Wrap fetch with x402 payment
      // @ts-ignore - viem version mismatch
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient, BigInt(amountInUSDC));

      // Call payment endpoint - x402-fetch will handle payment flow
      const response = await fetchWithPayment("/api/deep-research/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenMint,
          walletAddress: userWallet,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Payment failed" }));
        throw new Error(errorData.error || "Payment failed");
      }

      const data = await response.json();
      console.log("✅ Payment successful:", data);

      // Payment successful, analysis queued
      setJobId(data.jobId);
      setProgress(20);
      // Status already set to "processing"
    } catch (err: any) {
      console.error("❌ Payment error:", err);
      setError(err.message || "Payment failed. Please try again.");
      setStatus("payment"); // Go back to payment screen
    }
  };

  const startAnalysis = async () => {
    setStatus("processing");
    setProgress(10);

    try {
      // For free trial - use create endpoint (no payment)
      const response = await fetch("/api/deep-research/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint,
          userWallet,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start analysis");
      }

      const data = await response.json();
      setJobId(data.jobId);
      setProgress(20);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-black p-6 max-w-2xl w-full border border-gray-200 dark:border-gray-800 rounded-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-black dark:text-white">
            {status === "input" && "Start Deep Research"}
            {status === "payment" && "Complete Payment"}
            {status === "processing" && "Analyzing..."}
            {status === "completed" && "Analysis Complete"}
            {status === "error" && "Error"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Input Stage */}
        {status === "input" && (
          <div>
            <label className="block text-sm font-semibold mb-2">
              Solana Token Mint Address
            </label>
            <input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="e.g., C2omVhcvt3DDY77S2KZzawFJQeETZofgZ4eNWWkXpump"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {/* Pricing Display */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">Cost:</span>
                <span className="text-2xl font-bold">
                  ${pricingInfo?.pricing?.priceUSDC?.toFixed(3) || "0.50"}
                </span>
              </div>
              {pricingInfo?.trialPricing?.active && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  🧪 Testing period - $0.001 USDC until{" "}
                  {new Date(pricingInfo.trialPricing.endDate).toLocaleDateString()}
                  <br />
                  <span className="text-xs opacity-75">
                    (This tests the payment system - normal prices start after trial)
                  </span>
                </p>
              )}
              {pricingInfo?.pricing?.hasNFT && !pricingInfo?.trialPricing?.active && (
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  🎨 NFT holder discount applied (60% off)
                </p>
              )}
            </div>

            <button
              onClick={handleStartAnalysis}
              disabled={!tokenMint.trim()}
              className="w-full mt-6 px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pricingInfo?.trialPricing?.active
                ? "Pay $0.001 & Start Analysis"
                : "Continue to Payment"}
            </button>
          </div>
        )}

        {/* Payment Stage */}
        {status === "payment" && (
          <div>
            <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-3xl font-bold">
                  ${pricingInfo?.pricing?.priceUSDC || "0.50"} USDC
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Payment will be processed on Base network via x402 protocol
              </p>
            </div>

            <button
              onClick={handlePayment}
              className="w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Pay with USDC
            </button>

            <button
              onClick={() => setStatus("input")}
              className="w-full mt-3 px-6 py-3 border border-gray-300 dark:border-gray-700 text-black dark:text-white font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Processing Stage */}
        {status === "processing" && (
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-black dark:border-gray-700 dark:border-t-white" />
            </div>
            
            <p className="text-lg font-semibold mb-2">Analyzing token...</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This may take 30-60 seconds
            </p>

            {/* Progress Bar */}
            <div className="max-w-md mx-auto">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {progress}% complete
              </p>
            </div>

            <div className="mt-8 text-left max-w-md mx-auto space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>✓ Discovering best liquidity pool</p>
              <p>✓ Fetching 10,000+ swap transactions</p>
              <p>✓ Analyzing wallet patterns</p>
              <p className={progress > 50 ? "" : "opacity-50"}>
                {progress > 50 ? "✓" : "○"} Running AI analysis
              </p>
              <p className={progress > 80 ? "" : "opacity-50"}>
                {progress > 80 ? "✓" : "○"} Generating report
              </p>
            </div>
          </div>
        )}

        {/* Completed Stage */}
        {status === "completed" && analysisResult && (
          <div>
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-800 dark:text-green-200 font-semibold">
                ✓ Analysis completed successfully!
              </p>
            </div>

            {/* Analysis Report */}
            <div className="prose dark:prose-invert max-w-none">
              <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm">
                  {JSON.stringify(analysisResult, null, 2)}
                </pre>
              </div>
            </div>

            <button
              onClick={() => {
                onAnalysisComplete();
                onClose();
              }}
              className="w-full mt-6 px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Error Stage */}
        {status === "error" && (
          <div>
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-800 dark:text-red-200 font-semibold mb-2">
                Analysis Failed
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>

            <button
              onClick={() => {
                setStatus("input");
                setError(null);
                setProgress(0);
              }}
              className="w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

