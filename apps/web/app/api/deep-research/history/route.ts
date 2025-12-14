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

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If agent is unavailable (502, 503, 504), return empty history instead of error
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          console.warn("⚠️ Solana agent unavailable, returning empty history");
          return NextResponse.json({
            analyses: [],
            total: 0,
            limit,
            offset,
            hasMore: false,
          });
        }
        
        const errorData = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: errorData.error || "Failed to get analysis history" },
          { status: response.status }
        );
      }

      const data = await response.json();

      return NextResponse.json({
        analyses: data.analyses || [],
        total: data.total || 0,
        limit,
        offset,
        hasMore: (data.total || 0) > offset + limit,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // If fetch fails (network error, timeout, etc.), return empty history
      if (error.name === 'AbortError' || error.message?.includes('fetch')) {
        console.warn("⚠️ Failed to fetch history from agent, returning empty history:", error.message);
        return NextResponse.json({
          analyses: [],
          total: 0,
          limit,
          offset,
          hasMore: false,
        });
      }
      
      throw error; // Re-throw other errors
    }
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

