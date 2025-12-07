/**
 * Deep Research - User Analysis History
 * 
 * Get all analyses for a specific user wallet
 */

import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userWallet = searchParams.get("userWallet");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!userWallet) {
      return NextResponse.json(
        { error: "userWallet query parameter is required" },
        { status: 400 }
      );
    }

    console.log(`🔍 [Deep Research] Getting history for wallet: ${userWallet.substring(0, 10)}...`);

    // Query Solana agent for user's analyses
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const url = new URL(`${agentUrl}/api/analyses`);
    url.searchParams.set("userWallet", userWallet);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("offset", offset.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to get analysis history" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      analyses: data.analyses,
      total: data.total,
      limit,
      offset,
      hasMore: data.total > offset + limit,
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

