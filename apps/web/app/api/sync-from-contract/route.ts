/**
 * Sync Contract → Supabase
 * 
 * Contract'taki tüm mint edilmiş NFT'leri okur ve Supabase'i günceller
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";

const CONTRACT_ABI = [
  "function totalSupply() external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "event Minted(address indexed to, address indexed payer, uint256 indexed tokenId, uint256 xUserId, string tokenURI)",
];

export async function GET(request: NextRequest) {
  try {
    console.log("🔄 Starting contract → Supabase sync...");
    
    // Connect to contract
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const contract = new ethers.Contract(
      env.CONTRACT_ADDRESS,
      CONTRACT_ABI,
      provider
    );
    
    // Get total supply
    const totalSupply = await contract.totalSupply();
    console.log(`📊 Total minted: ${totalSupply}`);
    
    if (totalSupply === 0n) {
      return NextResponse.json({
        success: true,
        message: "No NFTs minted yet",
        synced: 0,
      });
    }
    
    // Get all Minted events from contract
    const filter = contract.filters.Minted();
    const events = await contract.queryFilter(filter, 0, "latest");
    
    console.log(`📝 Found ${events.length} Minted events`);
    
    const updates = [];
    const errors = [];
    
    for (const event of events) {
      try {
        const args = event.args as any;
        const tokenId = args.tokenId.toString();
        const xUserId = args.xUserId.toString();
        const tokenURI = args.tokenURI;
        const txHash = event.transactionHash;
        
        console.log(`🔍 Processing tokenId=${tokenId}, xUserId=${xUserId}`);
        
        // Convert xUserId (uint256) back to x_user_id (string)
        // xUserId is keccak256 hash of x_user_id string
        // We need to find the original x_user_id in database
        
        // First, try to find by metadata_uri
        const existingToken = await db
          .select()
          .from(tokens)
          .where(eq(tokens.metadata_uri, tokenURI))
          .limit(1);
        
        if (existingToken.length > 0) {
          const token = existingToken[0];
          
          // Update token_id and status
          await db
            .update(tokens)
            .set({
              token_id: Number(tokenId),
              tx_hash: txHash,
              status: "minted",
            })
            .where(eq(tokens.metadata_uri, tokenURI));
          
          console.log(`✅ Updated tokenId=${tokenId} for x_user_id=${token.x_user_id}`);
          
          updates.push({
            tokenId,
            x_user_id: token.x_user_id,
            txHash,
          });
        } else {
          console.warn(`⚠️ No matching record found for tokenURI=${tokenURI}`);
          errors.push({
            tokenId,
            tokenURI,
            reason: "No matching record in database",
          });
        }
      } catch (eventError) {
        console.error(`❌ Error processing event:`, eventError);
        errors.push({
          error: String(eventError),
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      totalSupply: totalSupply.toString(),
      eventsFound: events.length,
      updated: updates.length,
      updates,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("❌ Sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}

