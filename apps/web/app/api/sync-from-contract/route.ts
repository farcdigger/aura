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
  "function usedXUserId(uint256 xUserId) external view returns (bool)",
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
    
    // Get total supply from contract
    const totalSupply = await contract.totalSupply();
    console.log(`📊 Contract total minted: ${totalSupply}`);
    
    // Get all records from Supabase that need sync (status != 'minted' or token_id is null)
    console.log("📦 Getting records from Supabase that need sync...");
    const recordsToSync = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, "generated"));
    
    console.log(`📝 Found ${recordsToSync.length} records to check`);
    
    if (recordsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All records already synced",
        totalSupply: totalSupply.toString(),
        synced: 0,
      });
    }
    
    const updates = [];
    const errors = [];
    
    // For each record, check if it was minted on-chain
    for (const record of recordsToSync) {
      try {
        console.log(`🔍 Checking x_user_id=${record.x_user_id}...`);
        
        // Check contract's usedXUserId mapping
        const hash = ethers.id(record.x_user_id);
        const xUserIdBigInt = BigInt(hash);
        const isMinted = await contract.usedXUserId(xUserIdBigInt);
        
        if (isMinted) {
          console.log(`✅ Found minted NFT for x_user_id=${record.x_user_id}`);
          
          // We know it's minted, but we need to find the token_id
          // Search through recent token IDs
          const supply = Number(totalSupply);
          let foundTokenId: number | null = null;
          
          for (let tokenId = 1; tokenId <= supply; tokenId++) {
            try {
              const tokenURI = await contract.tokenURI(tokenId);
              if (tokenURI === record.metadata_uri) {
                foundTokenId = tokenId;
                console.log(`✅ Found tokenId=${tokenId} for metadata=${tokenURI}`);
                break;
              }
            } catch {
              // Token doesn't exist or error, continue
            }
          }
          
          if (foundTokenId) {
            // Update database
            await db
              .update(tokens)
              .set({
                token_id: foundTokenId,
                status: "minted",
              })
              .where(eq(tokens.x_user_id, record.x_user_id));
            
            console.log(`✅ Updated token_id=${foundTokenId} for x_user_id=${record.x_user_id}`);
            
            updates.push({
              x_user_id: record.x_user_id,
              token_id: foundTokenId,
            });
          } else {
            console.warn(`⚠️ Minted but token_id not found for x_user_id=${record.x_user_id}`);
            errors.push({
              x_user_id: record.x_user_id,
              reason: "Minted but token_id not found",
            });
          }
        } else {
          console.log(`ℹ️ Not minted yet: x_user_id=${record.x_user_id}`);
        }
      } catch (recordError) {
        console.error(`❌ Error processing record:`, recordError);
        errors.push({
          x_user_id: record.x_user_id,
          error: String(recordError),
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      totalSupply: totalSupply.toString(),
      recordsChecked: recordsToSync.length,
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

