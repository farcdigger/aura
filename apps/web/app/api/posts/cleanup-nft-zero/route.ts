/**
 * POST /api/posts/cleanup-nft-zero
 * Delete all posts with NFT token ID 0
 * Admin endpoint - use with caution
 */

import { NextRequest, NextResponse } from "next/server";
import { db, posts, post_favs } from "@/lib/db";
import { supabaseClient } from "@/lib/db-supabase";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    let deletedCount = 0;

    // Try Supabase first
    if (supabaseClient) {
      // First, delete all favs for posts with NFT #0
      const { data: postsToDelete } = await (supabaseClient as any)
        .from("posts")
        .select("id")
        .eq("nft_token_id", 0);

      if (postsToDelete && postsToDelete.length > 0) {
        const postIds = postsToDelete.map((p: any) => p.id);
        
        // Delete favs first
        for (const postId of postIds) {
          await (supabaseClient as any)
            .from("post_favs")
            .delete()
            .eq("post_id", postId);
        }

        // Then delete posts
        const { error: deleteError } = await (supabaseClient as any)
          .from("posts")
          .delete()
          .eq("nft_token_id", 0);

        if (!deleteError) {
          deletedCount = postsToDelete.length;
        } else {
          console.error("Supabase delete error:", deleteError);
        }
      }
    } else {
      // Fallback to Drizzle
      const postsToDelete = await db
        .select()
        .from(posts)
        .where(eq(posts.nft_token_id, 0));

      if (postsToDelete && postsToDelete.length > 0) {
        const postIds = postsToDelete.map((p) => p.id);

        // Delete favs first
        for (const postId of postIds) {
          await db
            .delete(post_favs)
            .where(eq(post_favs.post_id, postId));
        }

        // Then delete posts
        for (const postId of postIds) {
          await db
            .delete(posts)
            .where(eq(posts.id, postId));
        }

        deletedCount = postsToDelete.length;
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} posts with NFT token ID 0`,
    });
  } catch (error: any) {
    console.error("Error cleaning up NFT #0 posts:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

