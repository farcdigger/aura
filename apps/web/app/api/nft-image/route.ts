/**
 * GET /api/nft-image
 * Get NFT image URL for a wallet address
 * Returns the NFT image from database or fetches from contract
 */

import { NextRequest, NextResponse } from "next/server";
import { db, tokens, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0; // Never cache, always fetch fresh

// Convert IPFS URL to HTTP gateway URL
function ipfsToHttp(url: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
  }
  return url;
}

// Fetch NFT image from blockchain (fallback)
async function fetchNFTImageFromBlockchain(walletAddress: string): Promise<{ imageUrl: string | null; tokenId: number | null }> {
  const blockchainId = Date.now();
  console.log(`🔗 [BLOCKCHAIN-${blockchainId}] START: Fetching NFT from blockchain`);
  
  try {
    const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
    const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

    console.log(`📍 [BLOCKCHAIN-${blockchainId}] Config:`, {
      contract: CONTRACT_ADDRESS,
      rpc: RPC_URL,
      wallet: walletAddress.substring(0, 10) + "...",
    });

    const ERC721_ABI = [
      "function balanceOf(address owner) external view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
      "function tokenURI(uint256 tokenId) external view returns (string)",
    ];

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);

    // Check balance with timeout to prevent hanging
    console.log(`🔍 [BLOCKCHAIN-${blockchainId}] Step 1: Calling balanceOf()...`);
    const balance = await Promise.race([
      contract.balanceOf(walletAddress),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Balance check timeout")), 5000)
      ),
    ]) as bigint;

    console.log(`📊 [BLOCKCHAIN-${blockchainId}] Step 1: Balance result:`, {
      balance: balance.toString(),
      hasNFT: balance > 0n,
    });

    if (balance === 0n) {
      console.log(`❌ [BLOCKCHAIN-${blockchainId}] END: No NFT found (balance = 0)`);
      return { imageUrl: null, tokenId: null };
    }

    // Get first token ID
    console.log(`🔍 [BLOCKCHAIN-${blockchainId}] Step 2: Calling tokenOfOwnerByIndex(0)...`);
    const tokenId = await Promise.race([
      contract.tokenOfOwnerByIndex(walletAddress, 0),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Token ID fetch timeout")), 5000)
      ),
    ]) as bigint;

    console.log(`✅ [BLOCKCHAIN-${blockchainId}] Step 2: Token ID:`, Number(tokenId));

    // Get tokenURI (metadata URL)
    console.log(`🔍 [BLOCKCHAIN-${blockchainId}] Step 3: Calling tokenURI(${Number(tokenId)})...`);
    const tokenURI = await Promise.race([
      contract.tokenURI(tokenId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TokenURI fetch timeout")), 5000)
      ),
    ]) as string;

    console.log(`✅ [BLOCKCHAIN-${blockchainId}] Step 3: TokenURI:`, tokenURI.substring(0, 80) + "...");

    // Fetch metadata from tokenURI
    const metadataUrl = ipfsToHttp(tokenURI);
    console.log(`🌐 [BLOCKCHAIN-${blockchainId}] Step 4: Fetching metadata from:`, metadataUrl.substring(0, 80) + "...");
    
    const metadataResponse = await fetch(metadataUrl, {
      headers: { 'Accept': 'application/json' },
    });

    console.log(`📊 [BLOCKCHAIN-${blockchainId}] Step 4: Metadata response:`, {
      status: metadataResponse.status,
      ok: metadataResponse.ok,
    });

    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    const imageUrl = ipfsToHttp(metadata.image || "");

    console.log(`✅ [BLOCKCHAIN-${blockchainId}] Step 5: Extracted image URL:`, {
      tokenId: Number(tokenId),
      hasImage: !!imageUrl,
      imageUrl: imageUrl?.substring(0, 80) + "...",
    });

    console.log(`🏁 [BLOCKCHAIN-${blockchainId}] END: SUCCESS`);
    return { imageUrl, tokenId: Number(tokenId) };
  } catch (error: any) {
    // Detailed error logging
    console.error(`❌ [BLOCKCHAIN-${blockchainId}] ERROR:`, {
      message: error.message,
      code: error.code,
      errorCode: error?.info?.error?.code,
      errorMessage: error?.info?.error?.message,
      transaction: error?.transaction,
      reason: error?.reason,
      shortMessage: error?.shortMessage,
    });

    // Gracefully handle rate limit errors
    if (error?.info?.error?.code === -32016) {
      console.error(`⚠️  [BLOCKCHAIN-${blockchainId}] RATE LIMIT HIT! RPC provider is rate limiting requests.`);
      console.error(`💡 [BLOCKCHAIN-${blockchainId}] Solution: Wait a few minutes or upgrade RPC provider`);
    }
    
    console.log(`🏁 [BLOCKCHAIN-${blockchainId}] END: FAILED`);
    return { imageUrl: null, tokenId: null };
  }
}

export async function GET(request: NextRequest) {
  const requestId = Date.now(); // Unique ID for this request
  console.log(`🎬 [${requestId}] GET /api/nft-image - START`);
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("wallet");
    const nftTokenId = searchParams.get("nft_token_id");

    console.log(`📝 [${requestId}] GET /api/nft-image - Request params:`, {
      wallet: walletAddress?.substring(0, 10) + "..." || "NONE",
      nft_token_id: nftTokenId || "NONE",
    });

    if (!walletAddress && !nftTokenId) {
      console.error(`❌ [${requestId}] GET /api/nft-image - Missing parameters`);
      return NextResponse.json(
        { error: "Missing wallet or nft_token_id parameter" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress?.toLowerCase();
    console.log(`🔄 [${requestId}] GET /api/nft-image - Normalized wallet:`, normalizedAddress?.substring(0, 10) + "...");

    let nftImage: string | null = null;
    let tokenId: number | null = null;

    // Method 1: Get by NFT token ID (fastest, direct lookup)
    if (nftTokenId) {
      console.log(`🔍 [${requestId}] Method 1: Searching by nft_token_id in tokens table...`);
      try {
        const tokenResult = await db
          .select()
          .from(tokens)
          .where(eq(tokens.token_id, Number(nftTokenId)))
          .limit(1);

        console.log(`📊 [${requestId}] Method 1: Database query result:`, {
          found: tokenResult && tokenResult.length > 0,
          count: tokenResult?.length || 0,
        });

        if (tokenResult && tokenResult.length > 0) {
          const token = tokenResult[0];
          nftImage = token.image_uri || "";
          tokenId = token.token_id || null;
          
          console.log(`✅ [${requestId}] Method 1: SUCCESS - Found NFT image by token_id:`, {
            nft_token_id: nftTokenId,
            hasImage: !!nftImage,
            imageUrl: nftImage?.substring(0, 50) + "...",
          });
        } else {
          console.log(`❌ [${requestId}] Method 1: NOT FOUND - No token in database with ID ${nftTokenId}`);
        }
      } catch (error: any) {
        console.error(`❌ [${requestId}] Method 1: ERROR:`, {
          error: error.message,
          code: error.code,
        });
      }
    }

    // Method 2: Get by wallet address (lookup user, then token)
    if (!nftImage && normalizedAddress) {
      console.log(`🔍 [${requestId}] Method 2: Searching wallet → users → tokens...`);
      try {
        // Get user's x_user_id from wallet address
        const userResult = await db
          .select()
          .from(users)
          .where(eq(users.wallet_address, normalizedAddress))
          .limit(1);

        console.log(`📊 [${requestId}] Method 2: User lookup result:`, {
          found: userResult && userResult.length > 0,
          wallet: normalizedAddress?.substring(0, 10) + "...",
        });

        if (userResult && userResult.length > 0) {
          const user = userResult[0];
          console.log(`✅ [${requestId}] Method 2: User found, looking for token...`, {
            x_user_id: user.x_user_id,
          });
          
          // Get token by x_user_id
          const tokenResult = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, user.x_user_id))
            .limit(1);

          console.log(`📊 [${requestId}] Method 2: Token lookup result:`, {
            found: tokenResult && tokenResult.length > 0,
          });

          if (tokenResult && tokenResult.length > 0) {
            const token = tokenResult[0];
            nftImage = token.image_uri || "";
            tokenId = token.token_id || null;
            
            console.log(`✅ [${requestId}] Method 2: SUCCESS - Found NFT image:`, {
              wallet: normalizedAddress?.substring(0, 10) + "...",
              x_user_id: user.x_user_id,
              hasImage: !!nftImage,
              imageUrl: nftImage?.substring(0, 50) + "...",
            });
          } else {
            console.log(`❌ [${requestId}] Method 2: NOT FOUND - No token for this x_user_id`);
          }
        } else {
          console.log(`❌ [${requestId}] Method 2: NOT FOUND - Wallet not in users table`);
        }
      } catch (error: any) {
        console.error(`❌ [${requestId}] Method 2: ERROR:`, {
          error: error.message,
          code: error.code,
        });
      }
    }

    // Method 3: Direct lookup in tokens table by wallet_address (fallback)
    // This handles cases where user posted but isn't in users table yet
    if (!nftImage && normalizedAddress) {
      console.log(`🔍 [${requestId}] Method 3: Direct wallet lookup in tokens table...`);
      console.log(`🔍 [${requestId}] Method 3: Searching for wallet: ${normalizedAddress}`);
      try {
        const tokenResult = await db
          .select()
          .from(tokens)
          .where(eq(tokens.wallet_address, normalizedAddress))
          .limit(1);

        console.log(`📊 [${requestId}] Method 3: Database query result:`, {
          found: tokenResult && tokenResult.length > 0,
          count: tokenResult?.length || 0,
          wallet: normalizedAddress?.substring(0, 10) + "...",
        });

        if (tokenResult && tokenResult.length > 0) {
          const token = tokenResult[0];
          nftImage = token.image_uri || "";
          tokenId = token.token_id || null;
          
          console.log(`✅ [${requestId}] Method 3: SUCCESS - Token found in database:`, {
            wallet: normalizedAddress?.substring(0, 10) + "...",
            hasImageUri: !!token.image_uri,
            imageUri: token.image_uri?.substring(0, 50) + "..." || "NULL",
            tokenId: token.token_id,
            xUserId: token.x_user_id,
          });
          
          if (!nftImage) {
            console.log(`⚠️  [${requestId}] Method 3: Token found BUT image_uri is EMPTY/NULL!`);
          }
        } else {
          console.log(`❌ [${requestId}] Method 3: NOT FOUND - No token with this wallet address in database`);
        }
      } catch (error: any) {
        console.error(`❌ [${requestId}] Method 3: ERROR:`, {
          error: error.message,
          code: error.code,
        });
      }
    }

    // Method 4: DISABLED - Blockchain fallback
    // ❌ DISABLED: Contract doesn't have ERC721Enumerable (tokenOfOwnerByIndex doesn't exist)
    // ❌ DISABLED: Rate limit issues with RPC provider
    // ✅ SOLUTION: Use database only (Methods 1-3)
    if (!nftImage && normalizedAddress) {
      console.log(`⚠️  [${requestId}] Method 4: SKIPPED - Blockchain fallback disabled`);
      console.log(`📝 [${requestId}] Reason: Contract lacks ERC721Enumerable (tokenOfOwnerByIndex)`);
      console.log(`💡 [${requestId}] Solution: NFT image must be in database (tokens.image_uri)`);
    }

    // If STILL no NFT found after all methods
    if (!nftImage) {
      console.log(`❌ [${requestId}] ALL METHODS FAILED - No NFT image found:`, { 
        wallet: walletAddress?.substring(0, 10) + "...",
        nftTokenId,
      });
      console.log(`🏁 [${requestId}] GET /api/nft-image - END (404)`);
      return NextResponse.json(
        { 
          hasNFT: false,
          imageUrl: null,
          tokenId: null,
        },
        { 
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // Convert IPFS to HTTP if needed
    const httpImageUrl = ipfsToHttp(nftImage);
    
    console.log(`✅ [${requestId}] FINAL SUCCESS - NFT image found:`, {
      wallet: walletAddress?.substring(0, 10) + "...",
      tokenId,
      hasImage: !!httpImageUrl,
      imageUrl: httpImageUrl?.substring(0, 50) + "...",
    });
    console.log(`🏁 [${requestId}] GET /api/nft-image - END (200)`);

    return NextResponse.json(
      { 
        hasNFT: true,
        imageUrl: httpImageUrl,
        tokenId: tokenId,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error(`❌ [${requestId}] FATAL ERROR in /api/nft-image:`, {
      error: error.message,
      stack: error.stack,
      code: error.code,
      info: error.info,
    });
    console.log(`🏁 [${requestId}] GET /api/nft-image - END (500)`);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

