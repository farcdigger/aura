/**
 * POST /api/posts/create
 * Create a new post (tweet)
 * Requires NFT ownership
 * Burns 20,000 tokens and awards 8 points
 */

import { NextRequest, NextResponse } from "next/server";
import { db, posts, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";
import { ethers } from "ethers";

const TOKENS_TO_BURN = 20000; // 20,000 tokens per post
const POINTS_TO_AWARD = 8; // 8 points per post
const MAX_CONTENT_LENGTH = 280; // Character limit

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
    const { walletAddress, content } = body;

    console.log("📝 POST /api/posts/create - Request body:", {
      walletAddress: walletAddress?.substring(0, 10) + "...",
      contentLength: content?.length,
    });

    // Validate input
    if (!walletAddress || !content) {
      console.error("❌ POST /api/posts/create - Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: walletAddress and content" },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // Validate content length
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content too long. Maximum ${MAX_CONTENT_LENGTH} characters allowed.` },
        { status: 400 }
      );
    }

    if (content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content cannot be empty" },
        { status: 400 }
      );
    }

    // Normalize address - ethers.getAddress converts to checksum format
    const normalizedAddress = ethers.getAddress(walletAddress);
    const normalizedAddressLower = normalizedAddress.toLowerCase();

    console.log("🔄 POST /api/posts/create - Normalized address:", {
      original: walletAddress.substring(0, 10) + "...",
      normalized: normalizedAddress.substring(0, 10) + "...",
      lower: normalizedAddressLower.substring(0, 10) + "...",
    });

    // Check token balance first - if user has tokens, they have NFT (NFT check happens during token purchase)
    console.log("💰 POST /api/posts/create - Checking token balance...");
    const tokenBalanceResult = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddressLower))
      .limit(1);

    const currentBalance = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].balance) || 0
      : 0;

    console.log("💰 POST /api/posts/create - Token balance:", {
      currentBalance,
      required: TOKENS_TO_BURN,
      sufficient: currentBalance >= TOKENS_TO_BURN,
    });

    if (currentBalance < TOKENS_TO_BURN) {
      console.error("❌ POST /api/posts/create - Insufficient token balance");
      return NextResponse.json(
        { 
          error: "Insufficient token balance",
          required: TOKENS_TO_BURN,
          current: currentBalance,
        },
        { status: 402 }
      );
    }

    // Simple solution: Use wallet address as identifier
    // This way we can always show NFT image from database
    console.log("✅ POST /api/posts/create - Using wallet address as identifier:", {
      address: normalizedAddress.substring(0, 10) + "...",
    });

    // Get current points and total tokens spent
    const currentPoints = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].points) || 0
      : 0;
    
    const currentTotalSpent = tokenBalanceResult && tokenBalanceResult.length > 0
      ? Number(tokenBalanceResult[0].total_tokens_spent) || 0
      : 0;

    // Calculate new balance and points
    const newBalance = currentBalance - TOKENS_TO_BURN;
    const newTotalSpent = currentTotalSpent + TOKENS_TO_BURN;
    const newPoints = currentPoints + POINTS_TO_AWARD;

    // Update token balance (burn tokens and add points)
    await updateTokenBalance(normalizedAddressLower, newBalance, newPoints, newTotalSpent);

    // Create post - created_at will be set by database DEFAULT NOW() in UTC
    // Use wallet_address as identifier (nft_token_id can be 0 if not minted yet)
    let insertedPost;
    try {
      const result = await db.insert(posts).values({
        wallet_address: normalizedAddressLower,
        nft_token_id: 0, // We'll use wallet_address to identify users instead
        content: content.trim(),
        fav_count: 0,
        points_earned: POINTS_TO_AWARD,
        tokens_burned: TOKENS_TO_BURN,
      });
      
      insertedPost = result[0];
      
      // Verify insert worked
      if (!insertedPost || !insertedPost.id) {
        console.error("❌ Post insert failed - no ID returned:", insertedPost);
        throw new Error("Failed to create post - database did not return post ID");
      }
      
      console.log("✅ Post created successfully:", {
        id: insertedPost.id,
        wallet_address: normalizedAddressLower,
        content_length: content.trim().length,
        created_at: insertedPost.created_at,
      });
    } catch (insertError: any) {
      console.error("❌ Error inserting post:", insertError);
      throw new Error(`Failed to create post: ${insertError.message}`);
    }

    // Return complete post data with all required fields
    const postResponse = {
      id: Number(insertedPost.id),
      wallet_address: normalizedAddressLower, // Include wallet address for NFT image lookup
      nft_token_id: 0, // Not used anymore
      content: insertedPost.content || content.trim(),
      fav_count: Number(insertedPost.fav_count) || 0,
      // Ensure created_at is in ISO string format (UTC)
      created_at: insertedPost.created_at 
        ? new Date(insertedPost.created_at).toISOString() 
        : new Date().toISOString(),
    };
    
    console.log("📤 Sending post response:", postResponse);

    return NextResponse.json({
      success: true,
      post: postResponse,
      newBalance,
      newPoints,
      tokensBurned: TOKENS_TO_BURN,
      pointsEarned: POINTS_TO_AWARD,
    });
  } catch (error: any) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

