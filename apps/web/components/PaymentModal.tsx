"use client";

import { useState } from "react";
import { useWalletClient } from "wagmi";
import { wrapFetchWithPayment } from "x402-fetch";

interface PaymentModalProps {
  onClose: () => void;
  onPaymentSuccess: (newBalance?: number) => void;
  walletAddress: string | null;
}

const paymentOptions = [0.01, 0.5, 1, 1.5, 2];

export default function PaymentModal({
  onClose,
  onPaymentSuccess,
  walletAddress,
}: PaymentModalProps) {
  const [processing, setProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();

  const handlePaymentOption = async (amount: number) => {
    if (!walletAddress) {
      alert("Wallet not connected");
      return;
    }

    if (!walletClient) {
      alert("Wallet client not available. Please connect your wallet first.");
      return;
    }

    setProcessing(true);
    try {
      const amountInUSDC = Math.floor(amount * 1_000_000);
      
      // @ts-ignore - viem version mismatch between dependencies
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient, BigInt(amountInUSDC));
      
      const response = await fetchWithPayment(`/api/chat/payment?amount=${amount}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          amount: amount.toString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || errorData.message || "Payment failed");
      }

      const data = await response.json();
      console.log("✅ Payment successful:", data);
      
      // Pass the new balance to the callback
      onPaymentSuccess(data.newBalance);
    } catch (error: any) {
      console.error("❌ Payment error:", error);
      alert(error.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-2xl p-6 sm:p-8 max-w-md w-full border border-gray-200/50 dark:border-gray-800/50 rounded-2xl max-h-[90vh] overflow-y-auto shadow-[0_25px_70px_rgb(0,0,0,0.22)] dark:shadow-[0_25px_70px_rgb(255,255,255,0.15)]">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h3 className="text-2xl sm:text-3xl font-light text-gray-900 dark:text-gray-50 tracking-tight">
            Add Tokens
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6 font-light">
          Choose an amount to add tokens to your account. NFT ownership will be verified during payment.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {paymentOptions.map((amount) => (
            <button
              key={amount}
              onClick={() => handlePaymentOption(amount)}
              disabled={processing}
              className="px-4 py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl text-gray-900 dark:text-gray-100 border border-gray-300/20 dark:border-gray-700/20 font-medium hover:bg-white/30 dark:hover:bg-black/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 rounded-xl text-sm sm:text-base shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_15px_50px_rgb(255,255,255,0.12)]"
            >
              ${amount} USD
            </button>
          ))}
        </div>
        {processing && (
          <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-black dark:text-white">
            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Processing payment...</span>
          </div>
        )}
      </div>
    </div>
  );
}

