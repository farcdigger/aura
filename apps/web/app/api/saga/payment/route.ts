/**
 * x402 Payment endpoint for Loot Survivor Saga generation
 * Pricing: 0.5 USDC
 * 
 * Flow:
 * 1. Return 402 with payment requirements (0.5 USDC)
 * 2. x402-fetch handles payment on client
 * 3. CDP Facilitator settles USDC payment
 * 4. Saga generation proceeds
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";

const RECIPIENT_ADDRESS = "0xDA9097c5672928a16C42889cD4b07d9a766827ee"; // Same as other payments
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = "base";

// Saga generation price: 0.5 USDC (6 decimals)
const SAGA_PRICE_USDC = "500000"; // 0.5 USDC

// x402 payment requirements
function createPaymentRequirements() {
  return {
    scheme: "exact" as const,
    network: NETWORK,
    maxAmountRequired: SAGA_PRICE_USDC,
    resource: "https://xfroranft.xyz/api/saga/payment",
    description: `Loot Survivor Saga Generation - 0.5 USDC`,
    mimeType: "application/json",
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: BASE_USDC_ADDRESS,
    extra: {
      name: "USD Coin",
      version: "2"
    }
  };
}

/**
 * GET - Return 402 Payment Required
 * x402-fetch will call this first to get payment requirements
 */
export async function GET(request: NextRequest) {
  const paymentRequirements = createPaymentRequirements();

  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [paymentRequirements],
    },
    { 
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true"
      }
    }
  );
}

/**
 * POST - Process payment
 * x402-fetch will send payment header in X-PAYMENT header
 */
export async function POST(request: NextRequest) {
  try {
    // Check for x402 payment header (sent by x402-fetch after payment)
    const paymentHeader = request.headers.get("X-PAYMENT");
    
    if (!paymentHeader) {
      // No payment header - return 402 to request payment
      const paymentRequirements = createPaymentRequirements();
      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [paymentRequirements],
        },
        { 
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Required": "true"
          }
        }
      );
    }

    // Parse payment payload
    let paymentPayload;
    try {
      // x402-fetch might base64 encode the payload
      if (paymentHeader.startsWith('eyJ')) {
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
        paymentPayload = JSON.parse(decoded);
      } else {
        paymentPayload = JSON.parse(paymentHeader);
      }
      console.log("✅ Payment payload parsed:", {
        x402Version: paymentPayload.x402Version,
        scheme: paymentPayload.scheme,
        network: paymentPayload.network,
        hasPayload: !!paymentPayload.payload
      });
    } catch (error) {
      console.error("❌ Invalid payment header format:", error);
      return NextResponse.json(
        { error: "Invalid payment header" },
        { status: 400 }
      );
    }

    const paymentRequirements = createPaymentRequirements();

    // CRITICAL: Call CDP Facilitator SETTLE API to transfer USDC!
    console.log("💰 Calling CDP Facilitator SETTLE API to transfer USDC...");
    const settlement = await settlePaymentWithCDPFacilitator(paymentPayload, paymentRequirements);
    
    if (!settlement.success) {
      console.error("❌ Payment settlement failed:", settlement.errorReason);
      return NextResponse.json(
        { 
          error: "Payment settlement failed", 
          reason: settlement.errorReason 
        },
        { status: 402 }
      );
    }

    console.log("✅ Payment settled successfully!");
    console.log(`   Payer: ${settlement.payer}`);
    console.log(`   Transaction: ${settlement.transaction}`);

    const walletAddress = settlement.payer || paymentPayload.payload?.authorization?.from;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Could not determine payer address" },
        { status: 400 }
      );
    }

    // Payment successful - return success response
    return NextResponse.json({
      success: true,
      walletAddress: walletAddress,
      transaction: settlement.transaction,
      amount: "0.5",
      amountUSDC: SAGA_PRICE_USDC,
    });
  } catch (error: any) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

// Import settlement function from utility
import { settlePaymentWithCDPFacilitator } from "@/lib/saga/payment/settle-payment";

