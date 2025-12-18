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
  network?: 'solana' | 'base' | 'bsc'; // Network selection (default: 'solana')
}

interface PricingInfo {
  isFree: boolean;
  freeReason?: string; // "trial" | "nft_holder"
  priceUSDC: number;
  hasNFT: boolean;
}

// Constants
// Trial pricing: 4 days starting from today (Dec 14, 2025)
const TRIAL_PRICING_START = new Date("2025-12-14T00:00:00Z");
const TRIAL_PRICING_END = new Date("2025-12-18T00:00:00Z"); // 4 days: Dec 14, 15, 16, 17
const TRIAL_PRICE = 0.001; // $0.001 USDC during trial (almost free, but tests payment system)
const PRICE_WITH_NFT = 0.20; // $0.20 for NFT holders (after trial)
const PRICE_WITHOUT_NFT = 1.50; // $1.50 for non-holders (after trial)
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
    // Free ticket: charge 0.001 USDC (x402 doesn't accept $0)
    return {
      isFree: false, // Not free, but very cheap (0.001 USDC)
      freeReason: "free_ticket", // Still mark as free ticket for tracking
      priceUSDC: 0.001, // $0.001 USDC (minimal charge)
      hasNFT: false, // Not relevant when free ticket
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
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`${agentUrl}/api/weekly-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userWallet }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    console.log(`📊 Weekly limit API response: ${response.status} ${response.ok ? 'OK' : 'FAILED'}`);

    if (!response.ok) {
      console.error("❌ Weekly limit check failed:", response.status);
      // On error, assume limit is available (fail-open) to prevent blocking users
      return { allowed: true, current: 0, limit: WEEKLY_LIMIT, remaining: WEEKLY_LIMIT };
    }

    const data = await response.json();
    // Use remaining from API response, or calculate it
    const remaining = data.remaining !== undefined ? data.remaining : Math.max(0, WEEKLY_LIMIT - (data.current || 0));
    return {
      allowed: remaining > 0, // Use remaining > 0 instead of current < limit
      current: data.current || 0,
      limit: WEEKLY_LIMIT,
      remaining,
    };
  } catch (error: any) {
    console.error("❌ Error checking weekly limit:", error.message);
    // On error, assume limit is available (fail-open) to prevent blocking users
    // This allows the page to load even if the agent is temporarily unavailable
    return { allowed: true, current: 0, limit: WEEKLY_LIMIT, remaining: WEEKLY_LIMIT };
  }
}

/**
 * Queue analysis job
 */
async function queueAnalysisJob(
  tokenMint: string,
  userWallet: string,
  network: 'solana' | 'base' | 'bsc' = 'solana'
): Promise<{ jobId: string }> {
  try {
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const response = await fetch(`${agentUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenMint,
        userWallet,
        network, // Add network parameter
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
    const { tokenMint, userWallet, network = 'solana' } = body;

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

    // Validate token mint (Solana address: base58, 32-44 chars, NOT starting with 0x)
    // Check if it's an Ethereum address (starts with 0x) - reject it
    if (tokenMint.startsWith("0x") || tokenMint.startsWith("0X")) {
      return NextResponse.json(
        { 
          error: "Invalid network",
          message: "Solana ağı haricinde başka bir ağdan coin adresi yazdığınız için talebiniz başarısız oldu. Lütfen Solana ağından bir token mint adresi girin."
        },
        { status: 400 }
      );
    }
    
    // Validate Solana address format (base58, 32-44 chars)
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      return NextResponse.json(
        { 
          error: "Invalid Solana token mint address",
          message: "Solana ağı haricinde başka bir ağdan coin adresi yazdığınız için talebiniz başarısız oldu. Lütfen Solana ağından bir token mint adresi girin."
        },
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

    // Note: Free ticket is consumed after payment in payment route
    // Since free ticket now requires 0.001 USDC payment, it goes through payment flow

    // 5. Queue analysis job
    console.log("🚀 [Deep Research] Queuing analysis job...");
    const { jobId } = await queueAnalysisJob(tokenMint, userWallet, network);

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

    // Get queue stats for active analysis indicator
    let queueInfo = null;
    try {
      const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
      const queueStatsResponse = await fetch(`${agentUrl}/stats`);
      if (queueStatsResponse.ok) {
        const queueStats = await queueStatsResponse.json();
        queueInfo = {
          active: queueStats.active || 0,
          waiting: queueStats.waiting || 0,
          total: (queueStats.active || 0) + (queueStats.waiting || 0),
          maxSize: 4, // 2 active + 2 waiting
        };
        console.log("📊 Queue info fetched:", queueInfo);
      } else {
        console.warn("⚠️ Queue stats response not OK:", queueStatsResponse.status);
      }
    } catch (error: any) {
      console.warn("⚠️ Error fetching queue stats:", error.message);
      // Continue without queue info
    }

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
      queueInfo, // Add queue information for active analysis indicator
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

