/**
 * GET /api/posts/top-faver
 * Get the user who has faved the most posts
 * No NFT check required - everyone can view
 */

import { NextRequest, NextResponse } from "next/server";
import { db, post_favs } from "@/lib/db";
import { supabaseClient } from "@/lib/db-supabase";
import { sql } from "drizzle-orm";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get top faver (user who faved the most posts)
    if (supabaseClient) {
      const { data, error } = await (supabaseClient as any)
        .from("post_favs")
        .select("wallet_address")
        .then((result: any) => {
          // Count favs per wallet
          const counts: Record<string, number> = {};
          (result.data || []).forEach((fav: any) => {
            counts[fav.wallet_address] = (counts[fav.wallet_address] || 0) + 1;
          });
          
          // Find top faver
          let topFaver = { wallet_address: "", fav_count: 0 };
          Object.entries(counts).forEach(([wallet, count]) => {
            if (count > topFaver.fav_count) {
              topFaver = { wallet_address: wallet, fav_count: count as number };
            }
          });
          
          return { data: topFaver.fav_count > 0 ? [topFaver] : [], error: null };
        });

      if (error) {
        console.error("Supabase query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch top faver", details: error.message },
          { status: 500 }
        );
      }

      const topFaver = data && data.length > 0 ? data[0] : null;

      return NextResponse.json({
        topFaver,
      });
    }

    // Fallback to Drizzle (for mock mode)
    const allFavs = await db.select().from(post_favs);
    
    // Count favs per wallet
    const counts: Record<string, number> = {};
    allFavs.forEach((fav: any) => {
      const wallet = fav.wallet_address || "";
      counts[wallet] = (counts[wallet] || 0) + 1;
    });
    
    // Find top faver
    let topFaver = { wallet_address: "", fav_count: 0 };
    Object.entries(counts).forEach(([wallet, count]) => {
      if (count > topFaver.fav_count) {
        topFaver = { wallet_address: wallet, fav_count: count };
      }
    });

    return NextResponse.json({
      topFaver: topFaver.fav_count > 0 ? topFaver : null,
    });
  } catch (error: any) {
    console.error("Error fetching top faver:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

