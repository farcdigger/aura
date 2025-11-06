/**
 * x402 Server-side utilities
 * Payment verification is handled by middleware
 */

import { env } from "../env.mjs";

export interface X402PaymentRequest {
  asset: string;
  amount: string;
  network: string;
  recipient: string;
}

export interface X402PaymentResponse {
  x402Version: number;
  accepts: X402PaymentRequest[];
  error?: string;
}

/**
 * NOTE: This function is NOT used anymore.
 * Payment is handled by x402-next middleware automatically.
 */
export function createX402Response(recipient: string): X402PaymentResponse {
  const chainId = parseInt(env.NEXT_PUBLIC_CHAIN_ID || "8453");
  let network = "base";
  
  if (chainId === 8453) {
    network = "base";
  } else if (chainId === 84532) {
    network = "base-sepolia";
  }
  
  return {
    x402Version: 1,
    accepts: [
      {
        asset: "USDC",
        amount: env.X402_PRICE_USDC,
        network,
        recipient,
      },
    ],
    error: "",
  };
}
