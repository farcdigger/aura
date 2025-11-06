/**
 * Recent NFTs API
 * 
 * Supabase'den son mint edilmiş NFT'leri getirir
 */

import { NextResponse } from "next/server";
import { db, tokens } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    console.log("📊 Fetching recent minted NFTs...");
    
    // Get last 8 minted NFTs (status='minted' and token_id > 0)
    const recentNFTs = await db
      .select({
        id: tokens.id,
        token_id: tokens.token_id,
        image_uri: tokens.image_uri,
        x_user_id: tokens.x_user_id,
      })
      .from(tokens)
      .where(eq(tokens.status, "minted"))
      .orderBy(desc(tokens.id))
      .limit(8);
    
    console.log(`✅ Found ${recentNFTs.length} recent NFTs`);
    
    // Format for frontend
    const formattedNFTs = recentNFTs
      .filter((nft) => nft.token_id && nft.token_id > 0) // Only minted ones
      .map((nft) => ({
        id: nft.id,
        tokenId: nft.token_id,
        image: nft.image_uri?.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/") || "",
      }));
    
    return NextResponse.json({
      success: true,
      count: formattedNFTs.length,
      nfts: formattedNFTs,
    });
  } catch (error) {
    console.error("❌ Error fetching recent NFTs:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        nfts: [], // Empty array on error
      },
      { status: 500 }
    );
  }
}

