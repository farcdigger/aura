/**
 * x402 Payment endpoint for Deep Research
 * Pricing: $0.20 (NFT holders) vs $0.50 (standard)
 * 
 * Flow:
 * 1. Check NFT ownership (for pricing)
 * 2. Return 402 with payment requirements
 * 3. x402-fetch handles payment on client
 * 4. CDP Facilitator settles USDC payment
 * 5. Queue analysis job
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

const RECIPIENT_ADDRESS = "0xDA9097c5672928a16C42889cD4b07d9a766827ee"; // Same as other payments
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = "base";

// Pricing (USDC with 6 decimals)
const PRICE_WITH_NFT = "200000";    // $0.20 USDC
const PRICE_WITHOUT_NFT = "500000"; // $0.50 USDC

// x402 payment requirements
function createPaymentRequirements(amount: string, hasNFT: boolean) {
  const priceUSD = parseFloat(amount) / 1_000_000;
  const description = hasNFT
    ? `Deep Research Analysis (NFT Holder) - ${priceUSD} USDC`
    : `Deep Research Analysis - ${priceUSD} USDC`;

  return {
    scheme: "exact" as const,
    network: NETWORK,
    maxAmountRequired: amount,
    resource: "https://xfroranft.xyz/api/deep-research/payment",
    description,
    mimeType: "application/json",
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: BASE_USDC_ADDRESS,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };
}

/**
 * Check NFT ownership (for pricing)
 */
async function checkNFTOwnership(walletAddress: string): Promise<boolean> {
  try {
    if (!ethers.isAddress(walletAddress)) {
      return false;
    }

    const normalizedAddress = ethers.getAddress(walletAddress);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      ["function balanceOf(address owner) external view returns (uint256)"],
      provider
    );

    const balance = await contract.balanceOf(normalizedAddress);
    return balance > 0n;
  } catch (error: any) {
    console.error("Error checking NFT ownership:", error.message);
    return false;
  }
}

/**
 * GET - Return 402 Payment Required
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get("walletAddress");

  if (!walletAddress) {
    return NextResponse.json(
      { error: "walletAddress is required" },
      { status: 400 }
    );
  }

  // Check NFT ownership for pricing
  const hasNFT = await checkNFTOwnership(walletAddress);
  const paymentAmount = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
  const paymentRequirements = createPaymentRequirements(paymentAmount, hasNFT);

  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [paymentRequirements],
      hasNFT,
      priceUSD: parseFloat(paymentAmount) / 1_000_000,
    },
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true",
      },
    }
  );
}

/**
 * POST - Process payment and start analysis
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentHeader = request.headers.get("X-PAYMENT");

    // Get request body
    let body: any = null;
    try {
      const clonedRequest = request.clone();
      body = await clonedRequest.json();
    } catch (e) {
      // Body parsing failed
    }

    if (!body) {
      return NextResponse.json(
        { error: "Request body is required" },
        { status: 400 }
      );
    }

    const { tokenMint, walletAddress } = body;

    if (!tokenMint || !walletAddress) {
      return NextResponse.json(
        { error: "tokenMint and walletAddress are required" },
        { status: 400 }
      );
    }

    // If no payment header, return 402 with payment requirements
    if (!paymentHeader) {
      const hasNFT = await checkNFTOwnership(walletAddress);
      const paymentAmount = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
      const paymentRequirements = createPaymentRequirements(paymentAmount, hasNFT);

      console.log(`💳 Returning 402 for Deep Research: ${parseFloat(paymentAmount) / 1_000_000} USDC (NFT: ${hasNFT})`);

      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [paymentRequirements],
        },
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Required": "true",
          },
        }
      );
    }

    // Parse payment payload
    let paymentPayload;
    try {
      if (paymentHeader.startsWith("eyJ")) {
        const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
        paymentPayload = JSON.parse(decoded);
      } else {
        paymentPayload = JSON.parse(paymentHeader);
      }
      console.log("✅ Payment payload parsed");
    } catch (error) {
      console.error("❌ Invalid payment header format:", error);
      return NextResponse.json({ error: "Invalid payment header" }, { status: 400 });
    }

    // Determine payment amount based on NFT ownership
    const hasNFT = await checkNFTOwnership(walletAddress);
    const paymentAmountUSDC = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
    const paymentRequirements = createPaymentRequirements(paymentAmountUSDC, hasNFT);

    // Settle payment with CDP Facilitator (USDC transfer)
    console.log("💰 Settling payment with CDP Facilitator...");
    const settlement = await settlePaymentWithCDPFacilitator(paymentPayload, paymentRequirements);

    if (!settlement.success) {
      console.error("❌ Payment settlement failed:", settlement.errorReason);
      return NextResponse.json(
        {
          error: "Payment settlement failed",
          reason: settlement.errorReason,
        },
        { status: 402 }
      );
    }

    console.log("✅ Payment settled successfully!");
    console.log(`   Payer: ${settlement.payer}`);
    console.log(`   Transaction: ${settlement.transaction}`);

    const payer = settlement.payer || paymentPayload.payload?.authorization?.from;
    if (!payer) {
      return NextResponse.json({ error: "Could not determine payer address" }, { status: 400 });
    }

    // Queue analysis job
    console.log("🚀 Queuing analysis job...");
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";

    try {
      const analysisResponse = await fetch(`${agentUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint,
          userWallet: walletAddress,
          transactionLimit: 10000,
        }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to queue analysis");
      }

      const analysisData = await analysisResponse.json();

      return NextResponse.json({
        success: true,
        jobId: analysisData.jobId,
        paymentAmount: parseFloat(paymentAmountUSDC) / 1_000_000,
        hasNFT,
        transaction: settlement.transaction,
        payer,
      });
    } catch (error: any) {
      console.error("❌ Failed to queue analysis:", error);
      return NextResponse.json(
        {
          error: "Payment succeeded but analysis failed to start",
          message: error.message,
          transaction: settlement.transaction,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * CDP Facilitator API - Payment settlement
 */
async function settlePaymentWithCDPFacilitator(
  paymentPayload: any,
  paymentRequirements: ReturnType<typeof createPaymentRequirements>
): Promise<{
  success: boolean;
  payer?: string;
  transaction?: string;
  errorReason?: string;
}> {
  try {
    console.log("💰 Settling payment with CDP Facilitator API...");

    const apiKeyId = env.CDP_API_KEY_ID;
    const apiKeySecret = env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.error("❌ CDP API keys not configured");
      return { success: false, errorReason: "api_keys_missing" };
    }

    // Generate JWT token
    const { generateJwt } = await import("@coinbase/cdp-sdk/auth");

    const requestHost = "api.cdp.coinbase.com";
    const requestPath = "/platform/v2/x402/settle";
    const requestMethod = "POST";

    console.log("🔐 Generating CDP JWT token...");
    const token = await generateJwt({
      apiKeyId: apiKeyId,
      apiKeySecret: apiKeySecret,
      requestMethod: requestMethod,
      requestHost: requestHost,
      requestPath: requestPath,
      expiresIn: 120,
    });

    const requestBody = {
      x402Version: 1,
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements,
    };

    console.log("📤 Sending settlement request...");

    const response = await fetch(`https://${requestHost}${requestPath}`, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ CDP Facilitator error:", response.status, errorText);
      return { success: false, errorReason: "facilitator_error" };
    }

    const result = await response.json();
    console.log("✅ CDP Facilitator response:", result);

    return {
      success: true,
      payer: result.payer,
      transaction: result.transaction,
    };
  } catch (error: any) {
    console.error("❌ Settlement error:", error);
    return { success: false, errorReason: "exception" };
  }
}

