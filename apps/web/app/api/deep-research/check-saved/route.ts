/**
 * Deep Research - Check if Analysis is Saved
 * 
 * Check if user has saved a specific analysis
 */

import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userWallet = searchParams.get("userWallet");
    const analysisId = searchParams.get("analysisId");

    if (!userWallet || !analysisId) {
      return NextResponse.json(
        { error: "userWallet and analysisId query parameters are required" },
        { status: 400 }
      );
    }

    // Call Solana agent to check if saved
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const response = await fetch(
      `${agentUrl}/api/check-saved?userWallet=${encodeURIComponent(userWallet)}&analysisId=${encodeURIComponent(analysisId)}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to check saved status" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      isSaved: data.isSaved,
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

