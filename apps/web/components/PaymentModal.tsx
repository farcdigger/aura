"use client";

import { useState } from "react";
import { useWalletClient } from "wagmi";
import { wrapFetchWithPayment } from "x402-fetch";

interface PaymentModalProps {
  onClose: () => void;
  onPaymentSuccess: (newBalance?: number) => void;
  walletAddress: string | null;
}

const paymentOptions = [0.5, 1, 1.5, 2];

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-black dark:text-white">
            Add Tokens
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
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Choose an amount to add tokens to your account. NFT ownership will be verified during payment.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {paymentOptions.map((amount) => (
            <button
              key={amount}
              onClick={() => handlePaymentOption(amount)}
              disabled={processing}
              className="px-4 py-4 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ${amount} USD
            </button>
          ))}
        </div>
        {processing && (
          <div className="flex items-center justify-center gap-2 text-black dark:text-white">
            <div className="w-5 h-5 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Processing payment...</span>
          </div>
        )}
      </div>
    </div>
  );
}

