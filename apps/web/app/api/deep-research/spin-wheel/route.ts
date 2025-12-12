/**
 * Spin Wheel API for Deep Research
 * NFT owners can spin the wheel for 20,000 credits
 * Rewards:
 * - 4% chance: Free analysis ticket
 * - 96% chance: Credit rewards (100, 1000, 10000, 500)
 * - Always: 10 points
 */

import { NextRequest, NextResponse } from "next/server";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";
import { env } from "@/env.mjs";

const SPIN_COST = 20_000; // Credits required to spin
const POINTS_REWARD = 10; // Points awarded per spin
const FREE_ANALYSIS_CHANCE = 0.08; // 8% chance for free analysis (2/25 segments)

// Credit rewards (96% chance total)
const CREDIT_REWARDS = [
  { credits: 100, weight: 30 },   // 30% chance
  { credits: 500, weight: 25 },   // 25% chance
  { credits: 1000, weight: 25 },  // 25% chance
  { credits: 10000, weight: 16 }, // 16% chance
];

// Calculate total weight for normalization
const TOTAL_WEIGHT = CREDIT_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);

/**
 * Select a random credit reward based on weights
 */
function selectCreditReward(): number {
  const random = Math.random() * TOTAL_WEIGHT;
  let cumulative = 0;
  
  for (const reward of CREDIT_REWARDS) {
    cumulative += reward.weight;
    if (random <= cumulative) {
      return reward.credits;
    }
  }
  
  // Fallback to first reward
  return CREDIT_REWARDS[0].credits;
}

/**
 * POST /api/deep-research/spin-wheel
 * Spin the wheel and get a reward
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // 1. Check NFT ownership
    console.log("🎰 [Spin Wheel] Checking NFT ownership...");
    const hasNFT = await checkNFTOwnershipClientSide(normalizedAddress);
    
    if (!hasNFT) {
      return NextResponse.json(
        { 
          error: "NFT ownership required",
          message: "You must own an xFrora NFT to spin the wheel"
        },
        { status: 403 }
      );
    }

    // 2. Check credit balance
    console.log("💰 [Spin Wheel] Checking credit balance...");
    const { isMockMode } = await import("@/env.mjs");
    let currentBalance = 0;
    let currentPoints = 0;

    if (isMockMode) {
      const { getMockTokenBalances } = await import("@/lib/chat-tokens-mock");
      const mockBalances = getMockTokenBalances();
      const userData = mockBalances.get(normalizedAddress) || { balance: 0, points: 0 };
      currentBalance = userData.balance;
      currentPoints = userData.points;
    } else {
      const result = await db
        .select()
        .from(chat_tokens)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .limit(1);

      if (result && result.length > 0) {
        currentBalance = Number(result[0].balance) || 0;
        currentPoints = Number(result[0].points) || 0;
      } else {
        return NextResponse.json(
          { 
            error: "No credit account found",
            message: "Please purchase credits first"
          },
          { status: 400 }
        );
      }
    }

    // 3. Check if user has enough credits
    if (currentBalance < SPIN_COST) {
      return NextResponse.json(
        { 
          error: "Insufficient credits",
          message: `You need ${SPIN_COST.toLocaleString()} credits to spin. You have ${currentBalance.toLocaleString()} credits.`,
          required: SPIN_COST,
          current: currentBalance
        },
        { status: 402 }
      );
    }

    // 4. Deduct credits
    const newBalance = currentBalance - SPIN_COST;
    const newPoints = currentPoints + POINTS_REWARD;

    // 5. Determine reward
    const isFreeAnalysis = Math.random() < FREE_ANALYSIS_CHANCE;
    let reward: { type: "free_analysis" | "credits"; amount: number };

    if (isFreeAnalysis) {
      reward = { type: "free_analysis", amount: 0 };
      
      // Issue free ticket via Solana agent
      try {
        const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
        const ticketResponse = await fetch(`${agentUrl}/api/free-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userWallet: normalizedAddress,
            reason: "spin_wheel_prize",
            metadata: {
              timestamp: new Date().toISOString(),
              source: "spin_wheel",
            },
          }),
        });
        
        if (ticketResponse.ok) {
          console.log("✅ Free ticket issued via spin wheel");
        } else {
          console.warn("⚠️ Failed to issue free ticket, but continuing...");
        }
      } catch (error: any) {
        console.error("❌ Error issuing free ticket:", error.message);
        // Don't fail the spin if ticket issuance fails
      }
      
      // Update balance and points
      await updateTokenBalance(normalizedAddress, newBalance, newPoints);
    } else {
      const creditReward = selectCreditReward();
      reward = { type: "credits", amount: creditReward };
      // Add credit reward to balance
      await updateTokenBalance(normalizedAddress, newBalance + creditReward, newPoints);
    }

    console.log("🎉 [Spin Wheel] Spin completed:", {
      wallet: normalizedAddress,
      reward,
      newBalance: isFreeAnalysis ? newBalance : newBalance + reward.amount,
      newPoints,
    });

    // 7. Return result
    return NextResponse.json({
      success: true,
      reward,
      newBalance: isFreeAnalysis ? newBalance : newBalance + reward.amount,
      newPoints,
      creditsSpent: SPIN_COST,
      pointsEarned: POINTS_REWARD,
    });

  } catch (error: any) {
    console.error("❌ [Spin Wheel] Error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/deep-research/spin-wheel
 * Get spin wheel status (cost, rewards, user balance)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("walletAddress");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Check NFT ownership
    const hasNFT = await checkNFTOwnershipClientSide(normalizedAddress);

    if (!hasNFT) {
      return NextResponse.json({
        canSpin: false,
        reason: "NFT ownership required",
        cost: SPIN_COST,
        pointsReward: POINTS_REWARD,
      });
    }

    // Get credit balance
    const { isMockMode } = await import("@/env.mjs");
    let currentBalance = 0;

    if (isMockMode) {
      const { getMockTokenBalances } = await import("@/lib/chat-tokens-mock");
      const mockBalances = getMockTokenBalances();
      const userData = mockBalances.get(normalizedAddress) || { balance: 0 };
      currentBalance = userData.balance;
    } else {
      const result = await db
        .select()
        .from(chat_tokens)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .limit(1);

      if (result && result.length > 0) {
        currentBalance = Number(result[0].balance) || 0;
      }
    }

    const canSpin = currentBalance >= SPIN_COST;

    return NextResponse.json({
      canSpin,
      hasNFT,
      cost: SPIN_COST,
      currentBalance,
      pointsReward: POINTS_REWARD,
      freeAnalysisChance: FREE_ANALYSIS_CHANCE,
      creditRewards: CREDIT_REWARDS.map(r => ({
        credits: r.credits,
        chance: (r.weight / TOTAL_WEIGHT) * (1 - FREE_ANALYSIS_CHANCE) * 100,
      })),
    });

  } catch (error: any) {
    console.error("❌ [Spin Wheel] GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

