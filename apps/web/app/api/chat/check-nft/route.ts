/**
 * Check if wallet owns xFrora NFT
 * Uses contract check first, falls back to OpenSea API if contract check fails
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";
import axios from "axios";
import { db, tokens, users } from "@/lib/db";
import { eq } from "drizzle-orm";

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

// ERC721 ABI for balanceOf and tokenOfOwnerByIndex
const ERC721_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
];

/**
 * Check NFT ownership via OpenSea API (fallback method)
 * Returns both ownership status and image URL
 */
async function checkViaOpenSea(walletAddress: string): Promise<{ hasNFT: boolean; imageUrl: string | null }> {
  try {
    console.log("🔍 Checking NFT via OpenSea API...");
    
    // OpenSea API v2 endpoint for Base chain
    const url = `https://api.opensea.io/api/v2/chain/base/account/${walletAddress}/nfts`;
    
    const response = await axios.get(url, {
      params: {
        limit: 100, // Get up to 100 NFTs to search through
      },
      headers: {
        "Accept": "application/json",
        // OpenSea API key is optional but recommended for higher rate limits
        // "X-API-KEY": process.env.OPENSEA_API_KEY || "",
      },
      timeout: 10000, // 10 second timeout
    });

    const nfts = response.data?.nfts || [];
    
    // Filter NFTs by our contract address (case-insensitive comparison)
    const normalizedContractAddress = CONTRACT_ADDRESS.toLowerCase();
    const matchingNFTs = nfts.filter((nft: any) => {
      const nftContract = nft.contract?.toLowerCase() || nft.contract_address?.toLowerCase();
      return nftContract === normalizedContractAddress;
    });
    
    const hasNFT = matchingNFTs.length > 0;
    let imageUrl: string | null = null;

    // Get image from first matching NFT
    if (hasNFT && matchingNFTs[0]) {
      const nft = matchingNFTs[0];
      // OpenSea API v2 returns image in different possible fields
      imageUrl = nft.image_url || nft.image || nft.image_original_url || null;
      
      // If no direct image, try to get from collection
      if (!imageUrl && nft.collection?.image_url) {
        imageUrl = nft.collection.image_url;
      }
    }

    console.log("✅ OpenSea API check result:", {
      walletAddress,
      contractAddress: CONTRACT_ADDRESS,
      totalNFTs: nfts.length,
      matchingNFTs: matchingNFTs.length,
      hasNFT,
      hasImage: !!imageUrl,
      sampleNFT: matchingNFTs[0] ? {
        identifier: matchingNFTs[0].identifier,
        contract: matchingNFTs[0].contract || matchingNFTs[0].contract_address,
        imageUrl: imageUrl?.substring(0, 50) + "...",
      } : null,
    });

    return { hasNFT, imageUrl };
  } catch (error: any) {
    console.error("❌ OpenSea API check failed:", {
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing walletAddress" },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // Normalize address
    const normalizedAddress = ethers.getAddress(walletAddress);
    
    // Try contract check first
    let hasNFT = false;
    let balance = "0";
    let method = "contract";
    let nftImageUrl: string | null = null;
    let tokenId: number | null = null;
    
    try {
      console.log("🔍 Checking NFT ownership via contract:", {
        walletAddress: normalizedAddress,
        contractAddress: CONTRACT_ADDRESS,
        rpcUrl: RPC_URL,
      });

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
      
      const balanceResult = await contract.balanceOf(normalizedAddress);
      hasNFT = balanceResult > 0n;
      balance = balanceResult.toString();

      // If NFT exists, get the first token ID and fetch image from database
      if (hasNFT) {
        try {
          const firstTokenId = await contract.tokenOfOwnerByIndex(normalizedAddress, 0);
          tokenId = Number(firstTokenId);
          
          // Try to get image from database
          if (db) {
            try {
              // First try to find by token_id
              let tokenRows = await db
                .select()
                .from(tokens)
                .where(eq(tokens.token_id, tokenId))
                .limit(1);
              
              // If not found by token_id, try to find by wallet_address via users table
              if (tokenRows.length === 0) {
                try {
                  // Try both normalized and original address formats
                  const userRows = await db
                    .select()
                    .from(users)
                    .where(eq(users.wallet_address, normalizedAddress))
                    .limit(1);
                  
                  // If found user, get token by x_user_id
                  if (userRows.length > 0 && userRows[0].x_user_id) {
                    tokenRows = await db
                      .select()
                      .from(tokens)
                      .where(eq(tokens.x_user_id, userRows[0].x_user_id))
                      .limit(1);
                  } else {
                    // If still not found, try case-insensitive search via direct Supabase query
                    try {
                      const { supabaseClient } = await import("@/lib/db-supabase");
                      if (supabaseClient) {
                        const client = supabaseClient as any;
                        const { data: userData } = await client
                          .from("users")
                          .select("x_user_id")
                          .ilike("wallet_address", normalizedAddress)
                          .limit(1);
                        
                        if (userData && userData.length > 0) {
                          tokenRows = await db
                            .select()
                            .from(tokens)
                            .where(eq(tokens.x_user_id, userData[0].x_user_id))
                            .limit(1);
                        }
                      }
                    } catch (supabaseError) {
                      console.warn("Failed to find user via Supabase ilike:", supabaseError);
                    }
                  }
                } catch (userError) {
                  console.warn("Failed to find token via users table:", userError);
                }
              }
              
              if (tokenRows && tokenRows.length > 0) {
                const imageUri = tokenRows[0].image_uri || tokenRows[0].token_uri;
                if (imageUri) {
                  // Convert IPFS URL to gateway URL if needed
                  if (imageUri.startsWith("ipfs://")) {
                    nftImageUrl = `https://gateway.pinata.cloud/ipfs/${imageUri.replace("ipfs://", "")}`;
                  } else {
                    nftImageUrl = imageUri;
                  }
                  console.log("✅ Found NFT image from database:", {
                    tokenId,
                    imageUri: imageUri.substring(0, 50) + "...",
                    nftImageUrl: nftImageUrl.substring(0, 50) + "...",
                  });
                } else {
                  console.warn("⚠️ Database record found but no image_uri or token_uri");
                }
              } else {
                console.warn("⚠️ No database record found for tokenId:", tokenId);
                // Try to get image from contract tokenURI
                try {
                  const tokenURI = await contract.tokenURI(tokenId);
                  if (tokenURI) {
                    // Fetch metadata from tokenURI
                    let metadataUrl = tokenURI;
                    if (tokenURI.startsWith("ipfs://")) {
                      metadataUrl = `https://gateway.pinata.cloud/ipfs/${tokenURI.replace("ipfs://", "")}`;
                    }
                    const metadataResponse = await axios.get(metadataUrl, { timeout: 5000 });
                    const metadata = metadataResponse.data;
                    if (metadata?.image) {
                      let imageUrl = metadata.image;
                      if (imageUrl.startsWith("ipfs://")) {
                        nftImageUrl = `https://gateway.pinata.cloud/ipfs/${imageUrl.replace("ipfs://", "")}`;
                      } else {
                        nftImageUrl = imageUrl;
                      }
                      console.log("✅ Found NFT image from tokenURI metadata:", {
                        tokenId,
                        nftImageUrl: nftImageUrl.substring(0, 50) + "...",
                      });
                    }
                  }
                } catch (tokenURIError: any) {
                  console.warn("Failed to get image from tokenURI:", tokenURIError.message);
                }
              }
            } catch (dbError) {
              console.warn("Database lookup failed for NFT image:", dbError);
            }
          }
        } catch (tokenError: any) {
          console.warn("Failed to get token ID or image:", tokenError.message);
        }
      }

      console.log("✅ Contract check result:", {
        walletAddress: normalizedAddress,
        balance,
        hasNFT,
        tokenId,
        hasImage: !!nftImageUrl,
      });
    } catch (error: any) {
      console.warn("⚠️ Contract check failed, trying OpenSea API:", {
        error: error.message,
        code: error.code,
      });
      
      // Fallback to OpenSea API
      try {
        const openseaResult = await checkViaOpenSea(normalizedAddress);
        hasNFT = openseaResult.hasNFT;
        if (openseaResult.imageUrl && !nftImageUrl) {
          nftImageUrl = openseaResult.imageUrl;
        }
        method = "opensea";
        balance = hasNFT ? "1" : "0"; // OpenSea doesn't return exact balance easily
        
        console.log("✅ OpenSea API check completed:", {
          walletAddress: normalizedAddress,
          hasNFT,
          method,
        });
      } catch (openseaError: any) {
        console.error("❌ Both contract and OpenSea checks failed:", {
          contractError: error.message,
          openseaError: openseaError.message,
        });
        
        return NextResponse.json(
          { 
            error: "Failed to check NFT ownership", 
            message: "Both contract and OpenSea API checks failed",
            details: {
              contractError: error.message,
              openseaError: openseaError.message,
            },
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      hasNFT: hasNFT,
      balance: balance,
      method: method, // "contract" or "opensea"
      nftImageUrl: nftImageUrl || null, // NFT image URL if available
      tokenId: tokenId || null, // Token ID if available
    });
  } catch (error: any) {
    console.error("Error in check-nft endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

