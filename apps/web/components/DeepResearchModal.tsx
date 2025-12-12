"use client";

import { useState, useEffect } from "react";
import { useWalletClient } from "wagmi";
import { wrapFetchWithPayment } from "x402-fetch";
import ReactMarkdown from "react-markdown";

interface DeepResearchModalProps {
  onClose: () => void;
  userWallet: string;
  pricingInfo: any;
  tokenMint: string;
  onAnalysisComplete: () => void;
  selectedAnalysis?: any; // Pre-loaded analysis from history
}

type AnalysisStatus = "payment" | "processing" | "completed" | "error";

export default function DeepResearchModal({
  onClose,
  userWallet,
  pricingInfo,
  tokenMint: initialTokenMint,
  onAnalysisComplete,
  selectedAnalysis,
}: DeepResearchModalProps) {
  const [tokenMint] = useState(initialTokenMint);
  const [status, setStatus] = useState<AnalysisStatus>(
    selectedAnalysis ? "completed" : "payment"
  ); // If pre-loaded, show completed
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(selectedAnalysis ? 100 : 0);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(selectedAnalysis || null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
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
              
              // Check if analysis is already saved
              if (data.result?.recordId && userWallet) {
                checkIfSaved(data.result.recordId);
              }
              
              // Refresh history in background (don't close modal)
              setTimeout(() => {
                onAnalysisComplete();
              }, 2000);
            } else if (data.status === "failed") {
              setError(data.error || "Analysis failed");
              setStatus("error");
              clearInterval(interval);
            } else {
              // Use actual progress from job if available, otherwise estimate
              if (data.progress !== undefined && typeof data.progress === 'number') {
                setProgress(data.progress);
              } else {
                // Estimate based on time (2 minutes = 120 seconds, poll every 2 seconds = 60 polls)
                // Start at 10%, reach 95% after 2 minutes
                const elapsedPolls = Math.floor((Date.now() - (jobId ? parseInt(jobId.split('-').pop() || '0') : Date.now())) / 2000);
                const estimatedProgress = Math.min(95, 10 + (elapsedPolls * 1.4)); // ~1.4% per poll
                setProgress(estimatedProgress);
              }
            }
          }
        } catch (err) {
          console.error("Error polling status:", err);
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [status, jobId, progress]);

  // Check if analysis is saved
  const checkIfSaved = async (analysisId: string) => {
    if (!userWallet || !analysisId) return;
    
    try {
      const response = await fetch(
        `/api/deep-research/check-saved?userWallet=${encodeURIComponent(userWallet)}&analysisId=${encodeURIComponent(analysisId)}`
      );
      if (response.ok) {
        const data = await response.json();
        setIsSaved(data.isSaved || false);
      }
    } catch (err) {
      console.error("Error checking saved status:", err);
    }
  };

  // Save analysis
  const handleSaveAnalysis = async () => {
    if (!userWallet || !analysisResult?.recordId) {
      setError("Cannot save: missing user wallet or analysis ID");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/deep-research/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet,
          analysisId: analysisResult.recordId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save analysis");
      }

      const data = await response.json();
      setIsSaved(true);
      
      // Refresh history
      setTimeout(() => {
        onAnalysisComplete();
      }, 500);
      
    } catch (err: any) {
      console.error("Error saving analysis:", err);
      setError(err.message || "Failed to save analysis");
    } finally {
      setIsSaving(false);
    }
  };

  // Check if saved when modal opens with selectedAnalysis
  useEffect(() => {
    if (selectedAnalysis?.recordId && userWallet) {
      checkIfSaved(selectedAnalysis.recordId);
    }
  }, [selectedAnalysis, userWallet]);

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

    // ❌ REMOVED: Don't set status to "processing" before payment
    // Payment should complete first, then we start processing
    setError(null);

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
          walletAddress: userWallet.toLowerCase(), // Normalize to lowercase for consistent storage
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Payment failed" }));
        throw new Error(errorData.error || "Payment failed");
      }

      const data = await response.json();
      console.log("✅ Payment successful:", data);

      // ✅ Payment successful - NOW start processing
      setStatus("processing");
      setProgress(5);
      setJobId(data.jobId);
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

        {/* Payment Stage */}
        {status === "payment" && (
          <div>
            <div className="mb-6 p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Token</p>
                <p className="font-mono text-sm break-all">{tokenMint}</p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-3xl font-bold">
                  ${pricingInfo?.pricing?.priceUSDC?.toFixed(3) || "0.50"}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                USDC on Base network
              </p>
            </div>

            <button
              onClick={handlePayment}
              className="w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Pay with USDC
            </button>

            <button
              onClick={onClose}
              className="w-full mt-3 px-6 py-3 border border-gray-300 dark:border-gray-700 text-black dark:text-white font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            >
              Cancel
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
              This may take up to 2 minutes
            </p>

            {/* Progress Bar */}
            <div className="max-w-md mx-auto">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div
                  className="bg-black dark:bg-white h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {progress}% complete
              </p>
            </div>

            <div className="mt-8 text-left max-w-md mx-auto space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>Discovering best liquidity pool</p>
              <p>Fetching 10,000+ swap transactions</p>
              <p>Analyzing wallet patterns</p>
              <p className={progress > 50 ? "" : "opacity-50"}>
                Running AI analysis
              </p>
              <p className={progress > 80 ? "" : "opacity-50"}>
                Generating report
              </p>
            </div>
          </div>
        )}

        {/* Completed Stage */}
        {status === "completed" && analysisResult && (
          <div>
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">Analysis Complete</p>
                {analysisResult?.riskScore !== undefined && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Risk Score:</span>
                      <span className={`font-bold text-lg ${
                        analysisResult.riskScore <= 20 ? 'text-green-600' :
                        analysisResult.riskScore <= 40 ? 'text-yellow-600' :
                        analysisResult.riskScore <= 60 ? 'text-orange-600' :
                        analysisResult.riskScore <= 80 ? 'text-red-600' :
                        'text-red-800'
                      }`}>
                        {analysisResult.riskScore}/100
                      </span>
                    </div>
                    {/* Risk Score Bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          analysisResult.riskScore <= 20 ? 'bg-green-500' :
                          analysisResult.riskScore <= 40 ? 'bg-yellow-500' :
                          analysisResult.riskScore <= 60 ? 'bg-orange-500' :
                          analysisResult.riskScore <= 80 ? 'bg-red-500' :
                          'bg-red-700'
                        }`}
                        style={{ width: `${analysisResult.riskScore}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Report generated successfully
              </p>
            </div>

            {/* Analysis Report - Only show the AI-generated risk analysis */}
            <div className="prose dark:prose-invert max-w-none">
              <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg max-h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-800">
                {analysisResult?.analysisResult?.riskAnalysis ? (
                  <ReactMarkdown className="text-sm">
                    {analysisResult.analysisResult.riskAnalysis}
                  </ReactMarkdown>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">Analysis report not available</p>
                )}
              </div>
            </div>

            {/* Save Button */}
            {analysisResult?.recordId && (
              <div className="mt-4">
                {isSaved ? (
                  <div className="w-full px-6 py-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 font-semibold rounded-lg text-center">
                    ✓ Saved to History
                  </div>
                ) : (
                  <button
                    onClick={handleSaveAnalysis}
                    disabled={isSaving}
                    className="w-full px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? "Saving..." : "💾 Save to History"}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => {
                onAnalysisComplete();
                onClose();
              }}
              className="w-full mt-4 px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Error Stage */}
        {status === "error" && (
          <div>
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <p className="font-semibold mb-2">Analysis Failed</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {error}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

