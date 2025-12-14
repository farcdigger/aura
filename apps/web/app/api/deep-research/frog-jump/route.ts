/**
 * Frog Jump Game API for Deep Research
 * NFT owners can play for 50,000 credits
 * Rewards:
 * - Entry: 25 points
 * - Score 1000+: Free analysis ticket (redeemable)
 */

import { NextRequest, NextResponse } from "next/server";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";
import { env } from "@/env.mjs";
import { supabaseClient } from "@/lib/db-supabase";

const GAME_COST = 50_000; // Credits required to play
const POINTS_REWARD = 25; // Points awarded on entry
const SCORE_FOR_TICKET = 1000; // Score needed to redeem free ticket

/**
 * POST /api/deep-research/frog-jump
 * Actions: "start" (deduct credits, award points) or "end" (save score, check for ticket)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action, score } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // 1. Check NFT ownership
    console.log("🐸 [Frog Jump] Checking NFT ownership...");
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
    console.log("💰 [Frog Jump] Checking credit balance...");
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

      console.log("🐸 [Frog Jump] Game started:", {
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
        scoreForTicket: SCORE_FOR_TICKET,
      });

    } else if (action === "end") {
      // User finished the game - save score and check for ticket
      if (typeof score !== "number" || score < 0) {
        return NextResponse.json(
          { error: "Invalid score" },
          { status: 400 }
        );
      }

      console.log("🐸 [Frog Jump] Game ended:", {
        wallet: normalizedAddress,
        score,
      });

      // Save score to leaderboard and update total score
      let totalScore = 0;
      try {
        if (supabaseClient) {
          // Check if user already has a score
          const { data: existingScore } = await (supabaseClient as any)
            .from("frog_jump_leaderboard")
            .select("id, score, total_score")
            .eq("wallet_address", normalizedAddress)
            .single();

          if (existingScore) {
            // Update best score if new score is higher
            const newBestScore = score > existingScore.score ? score : existingScore.score;
            // Add current game score to total
            totalScore = (existingScore.total_score || 0) + score;
            
            await (supabaseClient as any)
              .from("frog_jump_leaderboard")
              .update({ 
                score: newBestScore,
                total_score: totalScore,
                updated_at: new Date().toISOString()
              })
              .eq("wallet_address", normalizedAddress);
            console.log("✅ Updated leaderboard score:", { best: newBestScore, total: totalScore });
          } else {
            // Insert new score
            totalScore = score;
            await (supabaseClient as any)
              .from("frog_jump_leaderboard")
              .insert({
                wallet_address: normalizedAddress,
                score,
                total_score: totalScore,
              });
            console.log("✅ Added new leaderboard score:", { best: score, total: totalScore });
          }
        }
      } catch (error: any) {
        console.error("❌ Error saving score to leaderboard:", error);
        // Don't fail the request if leaderboard save fails
      }

      return NextResponse.json({
        success: true,
        score,
        totalScore,
        canRedeem: totalScore >= SCORE_FOR_TICKET,
        message: `Game over! Your score: ${score}. Total: ${totalScore}. Reach ${SCORE_FOR_TICKET} total score to redeem a free ticket!`,
      });

    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'start' or 'end'" },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("❌ [Frog Jump] Error:", error);
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
 * GET /api/deep-research/frog-jump
 * Get game status (cost, requirements) or leaderboard
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("walletAddress");
    const leaderboard = searchParams.get("leaderboard") === "true";
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Leaderboard request
    if (leaderboard) {
      try {
        if (supabaseClient) {
          const { data, error } = await (supabaseClient as any)
            .from("frog_jump_leaderboard")
            .select("*")
            .order("score", { ascending: false })
            .limit(limit);

          if (error) {
            console.error("Supabase leaderboard query error:", error);
            return NextResponse.json(
              { error: "Failed to fetch leaderboard", details: error.message },
              { status: 500 }
            );
          }

          // Format response with ranks
          const leaderboardData = (data || []).map((entry: any, index: number) => ({
            rank: index + 1,
            wallet_address: entry.wallet_address,
            score: Number(entry.score) || 0,
            created_at: entry.created_at,
            updated_at: entry.updated_at,
          }));

          return NextResponse.json({
            leaderboard: leaderboardData,
            total: leaderboardData.length,
          });
        } else {
          return NextResponse.json({
            leaderboard: [],
            total: 0,
          });
        }
      } catch (error: any) {
        console.error("Error fetching leaderboard:", error);
        return NextResponse.json(
          { error: "Internal server error", message: error.message },
          { status: 500 }
        );
      }
    }

    // Game status request
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
        scoreForTicket: SCORE_FOR_TICKET,
      });
    }

    // Get credit balance
    const { isMockMode } = await import("@/env.mjs");
    let currentBalance = 0;
    let totalScore = 0;

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

    // Get total score
    try {
      if (supabaseClient) {
        const { data: scoreData } = await (supabaseClient as any)
          .from("frog_jump_leaderboard")
          .select("total_score")
          .eq("wallet_address", normalizedAddress)
          .single();
        
        if (scoreData) {
          totalScore = Number(scoreData.total_score) || 0;
        }
      }
    } catch (error) {
      // Ignore error, totalScore stays 0
    }

    const canPlay = currentBalance >= GAME_COST;

    return NextResponse.json({
      canPlay,
      hasNFT,
      cost: GAME_COST,
      currentBalance,
      pointsReward: POINTS_REWARD,
      scoreForTicket: SCORE_FOR_TICKET,
      totalScore,
    });

  } catch (error: any) {
    console.error("❌ [Frog Jump] GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

