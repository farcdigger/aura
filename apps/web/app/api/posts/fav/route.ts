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
    if (!walletAddress || !postId) {
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

    // Check if post exists
    const postResult = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!postResult || postResult.length === 0) {
      return NextResponse.json(
        { error: "Post not found" },
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

    // Get NFT token ID from database (users table or tokens table)
    // If user has token balance, they have NFT - get token ID from database
    let tokenId: number | null = null;
    
    try {
      // Try to get token ID from tokens table via users table
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
        }
      }
      
      // If still no token ID, check NFT ownership directly (fallback)
      if (!tokenId) {
        const { hasNFT, tokenId: checkedTokenId } = await checkNFTOwnership(normalizedAddress);
        if (hasNFT && checkedTokenId) {
          tokenId = checkedTokenId;
        }
      }
    } catch (error) {
      console.error("Error getting token ID:", error);
      // Continue with tokenId = null, will use 0 as fallback
    }
    
    // Use token ID 0 as fallback if not found (shouldn't happen if user has tokens)
    if (!tokenId) {
      tokenId = 0;
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

