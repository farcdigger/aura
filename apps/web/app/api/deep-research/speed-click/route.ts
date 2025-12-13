/**
 * Speed Click Game API for Deep Research
 * NFT owners can play for 20,000 credits
 * Rewards:
 * - Entry: 10 points
 * - Win: Free analysis ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";
import { env } from "@/env.mjs";

const GAME_COST = 20_000; // Credits required to play
const POINTS_REWARD = 10; // Points awarded on entry
const TARGETS_TO_WIN = 7; // Number of targets to hit to win

/**
 * POST /api/deep-research/speed-click
 * Start the game (deduct credits, award points)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // 1. Check NFT ownership
    console.log("🎮 [Speed Click] Checking NFT ownership...");
    const hasNFT = await checkNFTOwnershipClientSide(normalizedAddress);
    
    if (!hasNFT) {
      return NextResponse.json(
        { 
          error: "NFT ownership required",
          message: "You must own an xFrora NFT to play"
        },
        { status: 403 }
      );
    }

    // 2. Check credit balance
    console.log("💰 [Speed Click] Checking credit balance...");
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

    if (action === "start") {
      // 3. Check if user has enough credits
      if (currentBalance < GAME_COST) {
        return NextResponse.json(
          { 
            error: "Insufficient credits",
            message: `You need ${GAME_COST.toLocaleString()} credits to play. You have ${currentBalance.toLocaleString()} credits.`,
            required: GAME_COST,
            current: currentBalance
          },
          { status: 402 }
        );
      }

      // 4. Deduct credits and award points
      const newBalance = currentBalance - GAME_COST;
      const newPoints = currentPoints + POINTS_REWARD;

      await updateTokenBalance(normalizedAddress, newBalance, newPoints);

      console.log("🎮 [Speed Click] Game started:", {
        wallet: normalizedAddress,
        creditsSpent: GAME_COST,
        pointsEarned: POINTS_REWARD,
        newBalance,
        newPoints,
      });

      return NextResponse.json({
        success: true,
        gameStarted: true,
        newBalance,
        newPoints,
        creditsSpent: GAME_COST,
        pointsEarned: POINTS_REWARD,
        targetsToWin: TARGETS_TO_WIN,
      });

    } else if (action === "win") {
      // User won the game - issue free ticket
      console.log("🎉 [Speed Click] User won the game!");

      // Issue free ticket via Solana agent
      try {
        const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
        const ticketResponse = await fetch(`${agentUrl}/api/free-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userWallet: normalizedAddress,
            reason: "speed_click_game_win",
            metadata: {
              timestamp: new Date().toISOString(),
              source: "speed_click_game",
              targetsHit: TARGETS_TO_WIN,
            },
          }),
        });
        
        if (ticketResponse.ok) {
          console.log("✅ Free ticket issued via speed click game");
        } else {
          console.warn("⚠️ Failed to issue free ticket, but continuing...");
        }
      } catch (error: any) {
        console.error("❌ Error issuing free ticket:", error.message);
        // Don't fail the win if ticket issuance fails
      }

      return NextResponse.json({
        success: true,
        won: true,
        message: "Congratulations! You won a free analysis ticket!",
      });

    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'start' or 'win'" },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("❌ [Speed Click] Error:", error);
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
 * GET /api/deep-research/speed-click
 * Get game status (cost, requirements)
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
        canPlay: false,
        reason: "NFT ownership required",
        cost: GAME_COST,
        pointsReward: POINTS_REWARD,
        targetsToWin: TARGETS_TO_WIN,
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

    const canPlay = currentBalance >= GAME_COST;

    return NextResponse.json({
      canPlay,
      hasNFT,
      cost: GAME_COST,
      currentBalance,
      pointsReward: POINTS_REWARD,
      targetsToWin: TARGETS_TO_WIN,
      timePerTarget: 0.4, // seconds
    });

  } catch (error: any) {
    console.error("❌ [Speed Click] GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

