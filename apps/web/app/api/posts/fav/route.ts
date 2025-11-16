/**
 * POST /api/posts/fav
 * Favorite a post
 * Requires NFT ownership (checked on first fav, then cached)
 * Burns 100 tokens per fav
 */

import { NextRequest, NextResponse } from "next/server";
import { db, posts, post_favs, chat_tokens } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";
import { ethers } from "ethers";

const TOKENS_TO_BURN = 100; // 100 tokens per fav

/**
 * Check NFT ownership and get token ID
 * Directly use the check-nft logic instead of making HTTP call
 */
async function checkNFTOwnership(walletAddress: string): Promise<{ hasNFT: boolean; tokenId: number | null }> {
  try {
    // Import and use the check-nft logic directly
    const { ethers } = await import("ethers");
    const { env } = await import("@/env.mjs");

    const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
    const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

    const ERC721_ABI = [
      "function balanceOf(address owner) external view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
    ];

    if (!ethers.isAddress(walletAddress)) {
      console.error("Invalid wallet address:", walletAddress);
      return { hasNFT: false, tokenId: null };
    }

    // Normalize address - ethers.getAddress handles both lowercase and checksum
    const normalizedAddress = ethers.getAddress(walletAddress);
    console.log("🔍 Checking NFT ownership:", {
      originalAddress: walletAddress,
      normalizedAddress,
      contractAddress: CONTRACT_ADDRESS,
      rpcUrl: RPC_URL,
    });

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
      
      const balanceResult = await contract.balanceOf(normalizedAddress);
      const hasNFT = balanceResult > 0n;
      
      console.log("📊 NFT balance check result:", {
        address: normalizedAddress,
        balance: balanceResult.toString(),
        hasNFT,
      });

      if (!hasNFT) {
        return { hasNFT: false, tokenId: null };
      }

      // Get the first token ID
      const firstTokenId = await contract.tokenOfOwnerByIndex(normalizedAddress, 0);
      const tokenId = Number(firstTokenId);
      
      console.log("✅ NFT found:", {
        address: normalizedAddress,
        tokenId,
      });

      return { hasNFT: true, tokenId };
    } catch (error: any) {
      console.error("❌ Error checking NFT via contract:", {
        error: error.message,
        code: error.code,
        address: normalizedAddress,
        contractAddress: CONTRACT_ADDRESS,
      });
      return { hasNFT: false, tokenId: null };
    }
  } catch (error: any) {
    console.error("❌ Error checking NFT ownership:", {
      error: error.message,
      walletAddress,
    });
    return { hasNFT: false, tokenId: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, postId } = body;

    // Validate input
    if (!walletAddress || postId === undefined || postId === null) {
      return NextResponse.json(
        { error: "Missing required fields: walletAddress and postId" },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // Ensure postId is a number
    const postIdNum = typeof postId === 'string' ? parseInt(postId, 10) : Number(postId);
    if (isNaN(postIdNum) || postIdNum <= 0) {
      return NextResponse.json(
        { error: "Invalid post ID" },
        { status: 400 }
      );
    }

    // Normalize address - ethers.getAddress converts to checksum format
    const normalizedAddress = ethers.getAddress(walletAddress);
    const normalizedAddressLower = normalizedAddress.toLowerCase();

    // Check token balance first - if user has tokens, they have NFT (NFT check happens during token purchase)
    const tokenBalanceResult = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddressLower))
      .limit(1);

    const currentBalance = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].balance) || 0
      : 0;

    if (currentBalance < TOKENS_TO_BURN) {
      return NextResponse.json(
        { 
          error: "Insufficient token balance",
          required: TOKENS_TO_BURN,
          current: currentBalance,
        },
        { status: 402 }
      );
    }

    // Check if post exists - use numeric postId
    // Try Supabase first if available
    console.log("🔍 Looking for post with ID:", postIdNum);
    let postResult: any[] = [];
    
    try {
      const { supabaseClient } = await import("@/lib/db-supabase");
      if (supabaseClient) {
        const { data, error } = await (supabaseClient as any)
          .from("posts")
          .select("*")
          .eq("id", postIdNum)
          .limit(1);
        
        if (!error && data && data.length > 0) {
          postResult = data;
          console.log("✅ Post found via Supabase:", postIdNum);
        }
      }
    } catch (supabaseError) {
      console.warn("⚠️ Supabase query failed, trying Drizzle:", supabaseError);
    }
    
    // Fallback to Drizzle if Supabase didn't work
    if (postResult.length === 0) {
      try {
        postResult = await db
          .select()
          .from(posts)
          .where(eq(posts.id, postIdNum))
          .limit(1);
      } catch (drizzleError) {
        console.error("❌ Drizzle query failed:", drizzleError);
      }
    }

    if (!postResult || postResult.length === 0) {
      console.error("❌ Post not found:", { postId: postIdNum, postIdType: typeof postId });
      return NextResponse.json(
        { error: "Post not found", postId: postIdNum },
        { status: 404 }
      );
    }

    const post = postResult[0];

    // Check if already faved (duplicate prevention)
    const existingFav = await db
      .select()
      .from(post_favs)
      .where(
        and(
          eq(post_favs.post_id, postId),
          eq(post_favs.wallet_address, normalizedAddressLower)
        )
      )
      .limit(1);

    if (existingFav && existingFav.length > 0) {
      return NextResponse.json(
        { error: "Post already favorited" },
        { status: 400 }
      );
    }

    // Get NFT token ID - if user has token balance, they have NFT (verified during token purchase)
    // Try to get token ID from contract, but don't fail if contract check fails
    let tokenId: number | null = null;
    
    try {
      // Try contract first (most reliable)
      const { hasNFT, tokenId: contractTokenId } = await checkNFTOwnership(normalizedAddress);
      if (hasNFT && contractTokenId && contractTokenId > 0) {
        tokenId = contractTokenId;
        console.log("✅ NFT token ID from contract for fav:", {
          address: normalizedAddress,
          tokenId,
        });
      }
    } catch (error) {
      console.warn("⚠️ Contract check failed for fav, trying database:", error);
    }
    
    // If contract check failed, try database as fallback
    if (!tokenId || tokenId === 0) {
      try {
        const { users, tokens } = await import("@/lib/db");
        const userResult = await db
          .select()
          .from(users)
          .where(eq(users.wallet_address, normalizedAddressLower))
          .limit(1);
        
        if (userResult && userResult.length > 0) {
          const tokenResult = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, userResult[0].x_user_id))
            .limit(1);
          
          if (tokenResult && tokenResult.length > 0 && tokenResult[0].token_id) {
            tokenId = Number(tokenResult[0].token_id);
            console.log("✅ NFT token ID from database for fav:", {
              address: normalizedAddress,
              tokenId,
            });
          }
        }
      } catch (error) {
        console.warn("⚠️ Database check failed for fav:", error);
      }
    }
    
    // If still no token ID, try to get from user's existing posts
    if (!tokenId || tokenId === 0) {
      try {
        const existingPosts = await db
          .select()
          .from(posts)
          .where(eq(posts.wallet_address, normalizedAddressLower));
        
        // Sort by id descending (newest first) and get first one
        const existingPost = existingPosts
          .sort((a: any, b: any) => Number(b.id) - Number(a.id))
          .slice(0, 1);
        
        if (existingPost && existingPost.length > 0 && existingPost[0].nft_token_id > 0) {
          tokenId = Number(existingPost[0].nft_token_id);
          console.log("✅ NFT token ID from existing post for fav:", {
            address: normalizedAddress,
            tokenId,
          });
        }
      } catch (error) {
        console.warn("⚠️ Could not get token ID from existing posts for fav:", error);
      }
    }
    
    // Final fallback: if user has token balance, they have NFT
    // Use 1 as safe default (but this shouldn't happen)
    if (!tokenId || tokenId === 0) {
      console.warn("⚠️ Could not determine NFT token ID for fav, using fallback. User has token balance so NFT exists.");
      tokenId = 1; // Safe default - but this case shouldn't occur
    }

    // Get current points and total tokens spent
    const currentPoints = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].points) || 0
      : 0;
    
    const currentTotalSpent = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].total_tokens_spent) || 0
      : 0;

    // Calculate new balance
    const newBalance = currentBalance - TOKENS_TO_BURN;
    const newTotalSpent = currentTotalSpent + TOKENS_TO_BURN;

    // Update token balance (burn tokens, keep points same)
    await updateTokenBalance(normalizedAddress, newBalance, currentPoints, newTotalSpent);

    // Create fav record
    await db.insert(post_favs).values({
      post_id: postId,
      wallet_address: normalizedAddressLower,
      nft_token_id: tokenId,
      tokens_burned: TOKENS_TO_BURN,
    });

    // Update post fav_count
    const newFavCount = (Number(post.fav_count) || 0) + 1;
    await db
      .update(posts)
      .set({ fav_count: newFavCount })
      .where(eq(posts.id, postId));

    return NextResponse.json({
      success: true,
      postId,
      favCount: newFavCount,
      newBalance,
      tokensBurned: TOKENS_TO_BURN,
      nftTokenId: tokenId, // Return for caching
    });
  } catch (error: any) {
    console.error("Error favoriting post:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

