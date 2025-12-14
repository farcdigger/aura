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

type AnalysisStatus = "payment" | "waiting" | "processing" | "completed" | "error";

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

  // Prevent page unload during processing
  useEffect(() => {
    if (status === "processing") {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "Analysis is in progress. Are you sure you want to leave? Your payment will not be refunded.";
        return e.returnValue;
      };

      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }
  }, [status]);

  // Poll for job status
  useEffect(() => {
    if ((status === "processing" || status === "waiting") && jobId) {
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
            } else if (data.status === "waiting") {
              // Job is waiting in queue - don't show progress, just waiting message
              setStatus("waiting");
              setProgress(0);
            } else if (data.status === "active") {
              // Job is now active - show progress
              setStatus("processing");
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
            } else {
              // Other statuses - assume processing
              setStatus("processing");
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

    // Validate Solana address format - reject Ethereum addresses (0x...)
    if (tokenMint.startsWith("0x") || tokenMint.startsWith("0X")) {
      setError("Solana ağı haricinde başka bir ağdan coin adresi yazdığınız için talebiniz başarısız oldu. Lütfen Solana ağından bir token mint adresi girin.");
      return;
    }

    // Validate Solana address format (base58, 32-44 chars)
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      setError("Solana ağı haricinde başka bir ağdan coin adresi yazdığınız için talebiniz başarısız oldu. Lütfen Solana ağından bir token mint adresi girin.");
      return;
    }

    setError(null);

    // Check if payment is required
    // Free ticket still requires 0.001 USDC payment (x402 doesn't accept $0)
    const isFree = pricingInfo?.pricing?.isFree === true;

    if (!isFree) {
      setStatus("payment");
      return;
    }

    // Start analysis (free - using free ticket or trial)
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
        // Use the detailed message from backend if available
        const errorMessage = errorData.message || errorData.error || "Payment failed";
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("✅ Payment successful:", data);

      // ✅ Payment successful - NOW start processing
      setStatus("processing");
      setProgress(5);
      setJobId(data.jobId);
    } catch (err: any) {
      console.error("❌ Payment error:", err);
      // Use the error message directly (it may contain detailed info from backend)
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
        // Use the detailed message from backend if available
        const errorMessage = errorData.message || errorData.error || "Failed to start analysis";
        throw new Error(errorMessage);
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
          {/* Hide close button during processing to prevent accidental closure */}
          {status !== "processing" && (
            <button
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Payment Stage */}
        {status === "payment" && (
          <div>
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                  ⚠️ Error
                </p>
                <p className="text-xs text-red-800 dark:text-red-300 whitespace-pre-line">
                  {error}
                </p>
              </div>
            )}

            {/* Free Ticket Notice */}
            {pricingInfo?.pricing?.freeReason === "free_ticket" && !error && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-semibold text-green-900 dark:text-green-200 mb-1">
                  🎉 Report for 0.001 USDC
                </p>
                <p className="text-xs text-green-800 dark:text-green-300">
                  You won the game! Get a report for only 0.001 USDC.
                </p>
              </div>
            )}
            
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

        {/* Waiting in Queue Stage */}
        {status === "waiting" && (
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="inline-block animate-pulse rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
            </div>
            
            <p className="text-lg font-semibold mb-2">Waiting in queue...</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Your analysis is queued. An agent will start processing it soon.
            </p>
            
            {/* Info about queue */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-w-md mx-auto">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                ℹ️ Queue Information
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                Maximum 2 analyses run simultaneously. You are in the queue and will be processed as soon as an agent becomes available.
              </p>
            </div>

            {/* Warning about closing */}
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg max-w-md mx-auto">
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                ⚠️ Do not close this window
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                Your payment has been processed. Closing this window will not refund your payment.
              </p>
            </div>
          </div>
        )}

        {/* Processing Stage */}
        {status === "processing" && (
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-black dark:border-gray-700 dark:border-t-white" />
            </div>
            
            <p className="text-lg font-semibold mb-2">Analyzing token...</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This may take up to 2 minutes
            </p>
            
            {/* Warning about closing */}
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg max-w-md mx-auto">
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                ⚠️ Do not close this window
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                Analysis is in progress. Closing this window will not refund your payment.
              </p>
            </div>

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
                {analysisResult?.securityScore !== undefined && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Security Score:</span>
                      <span className={`font-bold text-lg ${
                        analysisResult.securityScore >= 80 ? 'text-green-600' :
                        analysisResult.securityScore >= 60 ? 'text-green-500' :
                        analysisResult.securityScore >= 40 ? 'text-yellow-500' :
                        analysisResult.securityScore >= 20 ? 'text-orange-500' :
                        'text-red-600'
                      }`}>
                        {analysisResult.securityScore}/100
                      </span>
                    </div>
                    {/* Security Score Bar */}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          analysisResult.securityScore >= 80 ? 'bg-green-500' :
                          analysisResult.securityScore >= 60 ? 'bg-green-400' :
                          analysisResult.securityScore >= 40 ? 'bg-yellow-500' :
                          analysisResult.securityScore >= 20 ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${analysisResult.securityScore}%` }}
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
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="font-semibold mb-2 text-red-900 dark:text-red-200">Analysis Failed</p>
              <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-line">
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

