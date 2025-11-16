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
    const { walletAddress, postId, nftVerified, nftTokenId } = body;

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

    // Normalize address - use ethers.getAddress for proper checksum format
    const normalizedAddress = ethers.isAddress(walletAddress) 
      ? ethers.getAddress(walletAddress) 
      : walletAddress.toLowerCase();

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
          eq(post_favs.wallet_address, normalizedAddress)
        )
      )
      .limit(1);

    if (existingFav && existingFav.length > 0) {
      return NextResponse.json(
        { error: "Post already favorited" },
        { status: 400 }
      );
    }

    // NFT verification: Use cache if provided, otherwise check
    let tokenId: number | null = null;
    
    if (nftVerified && nftTokenId) {
      // Use cached NFT verification
      tokenId = nftTokenId;
    } else {
      // Check NFT ownership
      const { hasNFT, tokenId: checkedTokenId } = await checkNFTOwnership(normalizedAddress);
      
      if (!hasNFT || !checkedTokenId) {
        return NextResponse.json(
          { error: "NFT ownership required to favorite posts" },
          { status: 403 }
        );
      }
      
      tokenId = checkedTokenId;
    }

    // Check token balance
    const tokenBalanceResult = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddress))
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
      wallet_address: normalizedAddress,
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

