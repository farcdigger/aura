/**
 * POST /api/deep-research/frog-jump/redeem-ticket
 * Redeem 500 points for a free analysis ticket (0.001 USDC)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";
import { env } from "@/env.mjs";
import { supabaseClient } from "@/lib/db-supabase";

const SCORE_FOR_TICKET = 1000; // Score needed to redeem ticket

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
    const hasNFT = await checkNFTOwnershipClientSide(normalizedAddress);
    
    if (!hasNFT) {
      return NextResponse.json(
        { 
          error: "NFT ownership required",
          message: "You must own an xFrora NFT to redeem tickets"
        },
        { status: 403 }
      );
    }

    // 2. Get current total score
    let totalScore = 0;
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
    } catch (error: any) {
      console.error("❌ Error fetching total score:", error);
      return NextResponse.json(
        { error: "Failed to fetch score" },
        { status: 500 }
      );
    }

    // 3. Check if user has enough points
    if (totalScore < SCORE_FOR_TICKET) {
      return NextResponse.json(
        { 
          error: "Insufficient points",
          message: `You need ${SCORE_FOR_TICKET} total points to redeem a ticket. You have ${totalScore} points.`,
          totalScore,
          required: SCORE_FOR_TICKET,
        },
        { status: 400 }
      );
    }

    // 4. Deduct 1000 points and update total score
    const newTotalScore = totalScore - SCORE_FOR_TICKET;
    try {
      if (supabaseClient) {
        // Get current best score to preserve it
        const { data: currentData } = await (supabaseClient as any)
          .from("frog_jump_leaderboard")
          .select("score")
          .eq("wallet_address", normalizedAddress)
          .single();

        const bestScore = currentData?.score || 0;

        // Update total score
        await (supabaseClient as any)
          .from("frog_jump_leaderboard")
          .update({ 
            total_score: newTotalScore,
            updated_at: new Date().toISOString()
          })
          .eq("wallet_address", normalizedAddress);

        console.log("✅ Points deducted:", { 
          wallet: normalizedAddress,
          oldTotal: totalScore,
          newTotal: newTotalScore,
          deducted: SCORE_FOR_TICKET
        });
      }
    } catch (error: any) {
      console.error("❌ Error updating total score:", error);
      return NextResponse.json(
        { error: "Failed to update score" },
        { status: 500 }
      );
    }

    // 5. Issue free ticket via Solana agent (Redis)
    try {
      const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
      const ticketResponse = await fetch(`${agentUrl}/api/free-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: normalizedAddress,
          reason: "frog_jump_game_redeem",
          metadata: {
            timestamp: new Date().toISOString(),
            source: "frog_jump_game",
            pointsRedeemed: SCORE_FOR_TICKET,
            previousTotalScore: totalScore,
            newTotalScore: newTotalScore,
          },
        }),
      });
      
      if (ticketResponse.ok) {
        console.log("✅ Free ticket issued via frog jump game redemption");
        return NextResponse.json({
          success: true,
          message: `Successfully redeemed ${SCORE_FOR_TICKET} points for a free analysis ticket (0.001 USDC)!`,
          totalScore: newTotalScore,
          ticketIssued: true,
        });
      } else {
        // If ticket issuance fails, we should rollback the score deduction
        // But for now, we'll just log the error
        console.error("❌ Failed to issue free ticket, but points were deducted");
        return NextResponse.json(
          { 
            error: "Failed to issue ticket",
            message: "Points were deducted but ticket issuance failed. Please contact support.",
            totalScore: newTotalScore,
          },
          { status: 500 }
        );
      }
    } catch (error: any) {
      console.error("❌ Error issuing free ticket:", error.message);
      return NextResponse.json(
        { 
          error: "Failed to issue ticket",
          message: error.message,
          totalScore: newTotalScore,
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error("❌ [Frog Jump Redeem] Error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error.message 
      },
      { status: 500 }
    );
  }
}

