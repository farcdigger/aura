/**
 * Deep Research - Save Analysis
 * 
 * Save an analysis to user's personal history
 */

import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userWallet, analysisId } = body;

    if (!userWallet || !analysisId) {
      return NextResponse.json(
        { error: "userWallet and analysisId are required" },
        { status: 400 }
      );
    }

    console.log(`💾 [Deep Research] Saving analysis ${analysisId} for user ${userWallet.substring(0, 10)}...`);

    // Call Solana agent to save analysis
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const response = await fetch(`${agentUrl}/api/save-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userWallet, analysisId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to save analysis" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      savedId: data.savedId,
      message: "Analysis saved successfully",
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

