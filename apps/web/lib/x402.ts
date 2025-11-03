import axios from "axios";
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

export interface X402PaymentVerification {
  paymentId: string;
  amount: string;
  asset: string;
  network: string;
  payer: string;
  recipient: string;
}

/**
 * Create x402 payment response for mint payment
 * Note: This is separate from Daydreams SDK's x402 payment (used for image generation)
 * This payment is for the NFT mint itself
 */
export function createX402Response(recipient: string): X402PaymentResponse {
  return {
    x402Version: 1,
    accepts: [
      {
        asset: "USDC",
        amount: env.X402_PRICE_USDC,
        network: "base",
        recipient,
      },
    ],
    error: "",
  };
}

/**
 * Verify x402 payment for mint
 * This verifies the payment made by the user for minting the NFT
 * Daydreams SDK handles its own x402 payments internally during image generation
 */
export async function verifyX402Payment(
  paymentHeader: string,
  facilitatorUrl?: string
): Promise<X402PaymentVerification | null> {
  try {
    // Parse X-PAYMENT header
    const paymentData = JSON.parse(paymentHeader);
    
    // If facilitator URL is provided, verify with facilitator
    if (facilitatorUrl) {
      const response = await axios.post(`${facilitatorUrl}/verify`, {
        payment: paymentData,
      });
      return response.data;
    }
    
    // Otherwise, basic verification (adjust based on x402 spec)
    if (paymentData.paymentId && paymentData.amount && paymentData.asset) {
      return {
        paymentId: paymentData.paymentId,
        amount: paymentData.amount,
        asset: paymentData.asset,
        network: paymentData.network || "base",
        payer: paymentData.payer,
        recipient: paymentData.recipient,
      };
    }
    
    return null;
  } catch (error) {
    console.error("x402 verification error:", error);
    return null;
  }
}

