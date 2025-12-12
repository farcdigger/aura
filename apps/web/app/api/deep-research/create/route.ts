/**
 * Deep Research - Create Analysis
 * 
 * Workflow:
 * 1. Validate token mint
 * 2. Check weekly limit (140 reports/week)
 * 3. Check NFT ownership (for pricing)
 * 4. Calculate price ($0.20 with NFT, $0.50 without)
 * 5. Check free trial (3 days from launch: Dec 7-9, 2025)
 * 6. Process payment (if not free)
 * 7. Queue analysis job
 * 8. Return job ID for status tracking
 */

import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

// Types
interface CreateAnalysisRequest {
  tokenMint: string;
  userWallet: string;
}

interface PricingInfo {
  isFree: boolean;
  freeReason?: string; // "trial" | "nft_holder"
  priceUSDC: number;
  hasNFT: boolean;
}

// Constants
const TRIAL_PRICING_START = new Date("2025-12-07T00:00:00Z");
const TRIAL_PRICING_END = new Date("2025-12-10T00:00:00Z"); // 3 days: Dec 7, 8, 9
const TRIAL_PRICE = 0.001; // $0.001 USDC during trial (almost free, but tests payment system)
const PRICE_WITH_NFT = 0.20; // $0.20 for NFT holders (after trial)
const PRICE_WITHOUT_NFT = 0.50; // $0.50 for non-holders (after trial)
const WEEKLY_LIMIT = 140;

/**
 * Check if we're in trial pricing period ($0.001 USDC)
 */
function isTrialPricing(): boolean {
  const now = new Date();
  return now >= TRIAL_PRICING_START && now < TRIAL_PRICING_END;
}

/**
 * Check NFT ownership (Base network)
 * NOTE: This checks xFrora NFT ownership on Base blockchain
 */
async function checkNFTOwnership(walletAddress: string): Promise<boolean> {
  try {
    // Use the existing NFT check API
    const response = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/chat/check-nft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });

    if (!response.ok) {
      console.error("❌ NFT check failed:", response.status);
      return false;
    }

    const data = await response.json();
    return data.hasNFT || false;
  } catch (error: any) {
    console.error("❌ Error checking NFT:", error.message);
    return false;
  }
}

/**
 * Check if user has a free ticket
 */
async function checkFreeTicketStatus(userWallet: string): Promise<boolean> {
  try {
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const ticketResponse = await fetch(`${agentUrl}/api/free-ticket?userWallet=${encodeURIComponent(userWallet)}`);
    if (ticketResponse.ok) {
      const ticketData = await ticketResponse.json();
      return ticketData.hasTicket || false;
    }
    return false;
  } catch (error: any) {
    console.warn("⚠️ Error checking free ticket:", error.message);
    return false;
  }
}

/**
 * Get pricing info based on trial period, NFT ownership, and free tickets
 */
async function getPricing(userWallet: string): Promise<PricingInfo> {
  // Check for free ticket first
  const hasFreeTicket = await checkFreeTicketStatus(userWallet);
  if (hasFreeTicket) {
    return {
      isFree: true,
      freeReason: "free_ticket",
      priceUSDC: 0,
      hasNFT: false, // Not relevant when free
    };
  }

  // Check if we're in trial pricing period
  if (isTrialPricing()) {
    return {
      isFree: false, // Not free, but very cheap ($0.001)
      freeReason: "trial", // Still show as trial for UI
      priceUSDC: TRIAL_PRICE, // $0.001 USDC
      hasNFT: false, // No NFT discount during trial
    };
  }

  // Normal pricing - check NFT ownership
  const hasNFT = await checkNFTOwnership(userWallet);

  return {
    isFree: false,
    priceUSDC: hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT,
    hasNFT,
  };
}

/**
 * Check weekly limit from Solana agent
 */
async function checkWeeklyLimit(userWallet: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}> {
  try {
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    console.log(`🔗 Checking weekly limit at: ${agentUrl}/api/weekly-limit`);
    
    const response = await fetch(`${agentUrl}/api/weekly-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userWallet }),
    });

    console.log(`📊 Weekly limit API response: ${response.status} ${response.ok ? 'OK' : 'FAILED'}`);

    if (!response.ok) {
      console.error("❌ Weekly limit check failed:", response.status);
      // PRODUCTION: Deny usage if limit check fails (strict mode)
      return { allowed: false, current: 0, limit: WEEKLY_LIMIT, remaining: 0 };
    }

    const data = await response.json();
    return {
      allowed: data.current < WEEKLY_LIMIT,
      current: data.current,
      limit: WEEKLY_LIMIT,
      remaining: Math.max(0, WEEKLY_LIMIT - data.current),
    };
  } catch (error: any) {
    console.error("❌ Error checking weekly limit:", error.message);
    // PRODUCTION: Deny usage if limit check fails (strict mode)
    return { allowed: false, current: 0, limit: WEEKLY_LIMIT, remaining: 0 };
  }
}

/**
 * Queue analysis job
 */
async function queueAnalysisJob(
  tokenMint: string,
  userWallet: string
): Promise<{ jobId: string }> {
  try {
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const response = await fetch(`${agentUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenMint,
        userWallet,
        transactionLimit: 10000, // Lite plan: 10K swaps
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to queue analysis");
    }

    const data = await response.json();
    return { jobId: data.jobId };
  } catch (error: any) {
    console.error("❌ Error queuing analysis:", error.message);
    throw error;
  }
}

/**
 * POST /api/deep-research/create
 */
export async function POST(request: Request) {
  try {
    const body: CreateAnalysisRequest = await request.json();
    const { tokenMint, userWallet } = body;

    console.log("🔍 [Deep Research] Create analysis request:", {
      tokenMint,
      userWallet: userWallet.substring(0, 10) + "...",
    });

    // 1. Validate input
    if (!tokenMint || !userWallet) {
      return NextResponse.json(
        { error: "tokenMint and userWallet are required" },
        { status: 400 }
      );
    }

    // Validate token mint (Solana address: base58, 32-44 chars)
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      return NextResponse.json(
        { error: "Invalid Solana token mint address" },
        { status: 400 }
      );
    }

    // Validate user wallet (accepts both Ethereum 0x... and Solana base58)
    // Ethereum: 42 chars (0x + 40 hex)
    // Solana: 32-44 chars (base58)
    if (!userWallet || userWallet.length < 32) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // 2. Check for free ticket first
    console.log("🎫 [Deep Research] Checking for free ticket...");
    let hasFreeTicket = false;
    try {
      const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
      const ticketResponse = await fetch(`${agentUrl}/api/free-ticket?userWallet=${encodeURIComponent(userWallet)}`);
      if (ticketResponse.ok) {
        const ticketData = await ticketResponse.json();
        hasFreeTicket = ticketData.hasTicket || false;
        if (hasFreeTicket) {
          console.log(`✅ Free ticket found for ${userWallet.substring(0, 10)}...`);
        }
      }
    } catch (ticketError: any) {
      console.warn("⚠️ Error checking free ticket:", ticketError.message);
      // Continue anyway - free ticket check is not critical
    }

    // 3. Check weekly limit (skip if free ticket exists)
    console.log("📊 [Deep Research] Checking weekly limit...");
    const limitStatus = await checkWeeklyLimit(userWallet);

    if (!limitStatus.allowed && !hasFreeTicket) {
      return NextResponse.json(
        {
          error: "Weekly limit reached",
          limitInfo: {
            current: limitStatus.current,
            limit: limitStatus.limit,
            remaining: 0,
          },
        },
        { status: 429 }
      );
    }

    console.log(`✅ Weekly limit OK: ${limitStatus.current}/${limitStatus.limit}`);

    // 3. Get pricing info
    console.log("💰 [Deep Research] Calculating pricing...");
    const pricing = await getPricing(userWallet);

    console.log("💰 Pricing:", {
      isFree: pricing.isFree,
      freeReason: pricing.freeReason,
      priceUSDC: pricing.priceUSDC,
      hasNFT: pricing.hasNFT,
    });

    // 4. Process payment (if not free)
    if (!pricing.isFree) {
      // Payment required - user should use /api/deep-research/payment endpoint instead
      return NextResponse.json(
        {
          error: "Payment required",
          pricing: {
            priceUSDC: pricing.priceUSDC,
            hasNFT: pricing.hasNFT,
            network: "base",
            asset: "USDC",
          },
          message: "Please use payment endpoint for paid analyses",
          paymentEndpoint: "/api/deep-research/payment",
        },
        { status: 402 } // Payment Required
      );
    }

    // 4.5. If using free ticket, consume it
    if (hasFreeTicket && pricing.freeReason === "free_ticket") {
      console.log("🎫 [Deep Research] Consuming free ticket...");
      try {
        const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
        const consumeResponse = await fetch(`${agentUrl}/api/free-ticket`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userWallet }),
        });
        
        if (consumeResponse.ok) {
          console.log("✅ Free ticket consumed");
        } else {
          console.warn("⚠️ Failed to consume free ticket, but continuing...");
        }
      } catch (ticketError: any) {
        console.warn("⚠️ Error consuming free ticket:", ticketError.message);
        // Continue anyway - ticket consumption is not critical
      }
    }

    // 5. Queue analysis job
    console.log("🚀 [Deep Research] Queuing analysis job...");
    const { jobId } = await queueAnalysisJob(tokenMint, userWallet);

    console.log(`✅ Analysis queued: ${jobId}`);

    // 6. Return success
    return NextResponse.json({
      success: true,
      jobId,
      pricing: {
        isFree: pricing.isFree,
        freeReason: pricing.freeReason,
        priceUSDC: pricing.priceUSDC,
        hasNFT: pricing.hasNFT,
      },
      limitInfo: {
        current: limitStatus.current + 1, // Will be incremented by worker
        limit: limitStatus.limit,
        remaining: limitStatus.remaining - 1,
      },
      estimatedTime: 40, // seconds (Lite plan estimate)
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/deep-research/create
 * Returns pricing info and limits (without creating analysis)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userWallet = searchParams.get("userWallet");

    if (!userWallet) {
      return NextResponse.json(
        { error: "userWallet query parameter is required" },
        { status: 400 }
      );
    }

    console.log("🔍 [Deep Research] Get pricing info:", {
      userWallet: userWallet.substring(0, 10) + "...",
    });

    // Check weekly limit
    const limitStatus = await checkWeeklyLimit(userWallet);

    // Get pricing
    const pricing = await getPricing(userWallet);

    return NextResponse.json({
      pricing: {
        isFree: pricing.isFree,
        freeReason: pricing.freeReason,
        priceUSDC: pricing.priceUSDC,
        hasNFT: pricing.hasNFT,
      },
      limitInfo: {
        current: limitStatus.current,
        limit: limitStatus.limit,
        remaining: limitStatus.remaining,
        allowed: limitStatus.allowed,
      },
      trialPricing: {
        active: isTrialPricing(),
        priceUSDC: TRIAL_PRICE,
        startDate: TRIAL_PRICING_START.toISOString(),
        endDate: TRIAL_PRICING_END.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

