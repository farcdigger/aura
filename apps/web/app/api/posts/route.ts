/**
 * GET /api/posts
 * Get latest 200 posts (tweets)
 * No NFT check required - everyone can view
 */

import { NextRequest, NextResponse } from "next/server";
import { db, posts } from "@/lib/db";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSTS_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    // Use Supabase client directly for ordering
    if (supabaseClient) {
      const { data, error } = await (supabaseClient as any)
        .from("posts")
        .select("*")
        .order("id", { ascending: false })
        .limit(POSTS_LIMIT * 2); // Get more to filter out NFT #0

      if (error) {
        console.error("Supabase query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch posts", details: error.message },
          { status: 500 }
        );
      }

      // Get posts (already ordered by id descending)
      // Note: We now use wallet_address instead of nft_token_id for identification
      const validPosts = (data || [])
        .filter((post: any) => post.wallet_address) // Only posts with wallet_address
        .slice(0, POSTS_LIMIT); // Take first N (already sorted by id descending)

      return NextResponse.json({
        posts: validPosts.map((post: any) => ({
          id: Number(post.id),
          wallet_address: post.wallet_address, // Add wallet address for NFT image lookup
          nft_token_id: Number(post.nft_token_id) || 0,
          content: post.content || "",
          fav_count: Number(post.fav_count) || 0,
          // Ensure created_at is in ISO string format (UTC) with Z suffix
          created_at: post.created_at ? new Date(post.created_at).toISOString() : new Date().toISOString(),
        })),
        total: validPosts.length,
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    // Fallback to Drizzle (for mock mode)
    const allPosts = await db
      .select()
      .from(posts)
      .limit(POSTS_LIMIT);

    // Sort by id descending (newest first) if created_at is null, otherwise by created_at
    const sortedPosts = allPosts
      .sort((a: any, b: any) => {
        // If both have created_at, sort by date
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA; // Newest first
        }
        // If one has created_at and other doesn't, prioritize the one with created_at
        if (a.created_at && !b.created_at) return -1;
        if (!a.created_at && b.created_at) return 1;
        // If neither has created_at, sort by id (newest first)
        return Number(b.id) - Number(a.id);
      })
      .slice(0, POSTS_LIMIT);

    // Filter posts with wallet_address (now used instead of nft_token_id)
    const validPosts = sortedPosts.filter((post: any) => post.wallet_address);

    return NextResponse.json({
      posts: validPosts.map((post: any) => ({
        id: Number(post.id),
        wallet_address: post.wallet_address, // Add wallet address for NFT image lookup
        nft_token_id: Number(post.nft_token_id) || 0,
        content: post.content || "",
        fav_count: Number(post.fav_count) || 0,
        // Ensure created_at is in ISO string format (UTC) with Z suffix
        created_at: post.created_at ? new Date(post.created_at).toISOString() : new Date().toISOString(),
      })),
      total: validPosts.length,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

