/**
 * GET /api/posts
 * Get latest 200 posts (tweets)
 * No NFT check required - everyone can view
 */

import { NextRequest, NextResponse } from "next/server";
import { db, posts } from "@/lib/db";
import { supabaseClient } from "@/lib/db-supabase";

const POSTS_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    // Use Supabase client directly for ordering
    if (supabaseClient) {
      const { data, error } = await (supabaseClient as any)
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(POSTS_LIMIT);

      if (error) {
        console.error("Supabase query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch posts", details: error.message },
          { status: 500 }
        );
      }

      // Filter out posts with NFT #0, then sort
      const validPosts = (data || [])
        .filter((post: any) => post.nft_token_id && Number(post.nft_token_id) > 0) // Exclude NFT #0
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

      return NextResponse.json({
        posts: validPosts.map((post: any) => ({
          id: Number(post.id),
          nft_token_id: Number(post.nft_token_id) || 0,
          content: post.content || "",
          fav_count: Number(post.fav_count) || 0,
          created_at: post.created_at,
        })),
        total: validPosts.length,
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

    // Filter out posts with NFT #0
    const validPosts = sortedPosts.filter((post: any) => post.nft_token_id && Number(post.nft_token_id) > 0);

    return NextResponse.json({
      posts: validPosts.map((post: any) => ({
        id: Number(post.id),
        nft_token_id: Number(post.nft_token_id) || 0,
        content: post.content || "",
        fav_count: Number(post.fav_count) || 0,
        created_at: post.created_at,
      })),
      total: validPosts.length,
    });
  } catch (error: any) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

