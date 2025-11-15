/**
 * Leaderboard endpoint for chatbot points
 * Returns top users by points
 */

import { NextRequest, NextResponse } from "next/server";
import { db, chat_tokens } from "@/lib/db";
import { isMockMode } from "@/env.mjs";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (isMockMode) {
      // Mock mode: return empty leaderboard or mock data
      const { mockTokenBalances } = await import("../token-balance/route");
      
      // Convert Map to array and sort by points
      const users = Array.from(mockTokenBalances.entries())
        .map(([wallet, data]) => ({
          wallet_address: wallet,
          points: data.points || 0,
          total_tokens_spent: data.totalTokensSpent || 0,
          balance: data.balance || 0,
        }))
        .sort((a, b) => b.points - a.points)
        .slice(offset, offset + limit)
        .map((user, index) => ({
          rank: offset + index + 1,
          wallet_address: user.wallet_address,
          points: user.points,
          total_tokens_spent: user.total_tokens_spent,
          balance: user.balance,
        }));

      return NextResponse.json({
        leaderboard: users,
        total: mockTokenBalances.size,
        limit,
        offset,
      });
    }

    // Database mode: query from Supabase
    try {
      // Use raw SQL for ordering and limiting (Supabase REST API doesn't support ORDER BY easily)
      // We'll use Supabase client directly for this query
      const { supabaseClient } = await import("@/lib/db-supabase");
      
      if (!supabaseClient) {
        return NextResponse.json(
          { error: "Database not available" },
          { status: 500 }
        );
      }

      // Query top users by points
      const { data, error, count } = await (supabaseClient as any)
        .from("chat_tokens")
        .select("*", { count: "exact" })
        .order("points", { ascending: false })
        .order("total_tokens_spent", { ascending: false }) // Secondary sort
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Supabase leaderboard query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch leaderboard", details: error.message },
          { status: 500 }
        );
      }

      // Format response with ranks
      const leaderboard = (data || []).map((user: any, index: number) => ({
        rank: offset + index + 1,
        wallet_address: user.wallet_address,
        points: Number(user.points) || 0,
        total_tokens_spent: Number(user.total_tokens_spent) || 0,
        balance: Number(user.balance) || 0,
        updated_at: user.updated_at,
      }));

      return NextResponse.json({
        leaderboard,
        total: count || 0,
        limit,
        offset,
      });
    } catch (dbError: any) {
      console.error("Database error fetching leaderboard:", dbError);
      return NextResponse.json(
        { error: "Internal server error", message: dbError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in leaderboard endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET user's rank by wallet address
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing walletAddress" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    if (isMockMode) {
      const { mockTokenBalances } = await import("../token-balance/route");
      const userData = mockTokenBalances.get(normalizedAddress);
      
      if (!userData) {
        return NextResponse.json({
          rank: null,
          points: 0,
          total_users: mockTokenBalances.size,
        });
      }

      // Calculate rank
      const users = Array.from(mockTokenBalances.entries())
        .map(([wallet, data]) => ({
          wallet,
          points: data.points || 0,
        }))
        .sort((a, b) => b.points - a.points);

      const rank = users.findIndex((u) => u.wallet === normalizedAddress) + 1;

      return NextResponse.json({
        rank: rank > 0 ? rank : null,
        points: userData.points || 0,
        total_users: mockTokenBalances.size,
      });
    }

    // Database mode
    try {
      const { supabaseClient } = await import("@/lib/db-supabase");
      
      if (!supabaseClient) {
        return NextResponse.json(
          { error: "Database not available" },
          { status: 500 }
        );
      }

      // Get user's points
      const { data: userData, error: userError } = await (supabaseClient as any)
        .from("chat_tokens")
        .select("points")
        .eq("wallet_address", normalizedAddress)
        .single();

      if (userError || !userData) {
        // User not found
        const { count } = await (supabaseClient as any)
          .from("chat_tokens")
          .select("*", { count: "exact", head: true });

        return NextResponse.json({
          rank: null,
          points: 0,
          total_users: count || 0,
        });
      }

      const userPoints = Number(userData.points) || 0;

      // Count users with more points (rank = count + 1)
      const { count, error: countError } = await (supabaseClient as any)
        .from("chat_tokens")
        .select("*", { count: "exact", head: true })
        .gt("points", userPoints);

      if (countError) {
        throw countError;
      }

      const rank = (count || 0) + 1;

      // Get total users
      const { count: totalUsers } = await (supabaseClient as any)
        .from("chat_tokens")
        .select("*", { count: "exact", head: true });

      return NextResponse.json({
        rank,
        points: userPoints,
        total_users: totalUsers || 0,
      });
    } catch (dbError: any) {
      console.error("Database error fetching user rank:", dbError);
      return NextResponse.json(
        { error: "Internal server error", message: dbError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in user rank endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

