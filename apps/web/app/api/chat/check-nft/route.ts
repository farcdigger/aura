/**
 * Check if wallet owns xFrora NFT
 * Uses contract check first, falls back to OpenSea API if contract check fails
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";
import axios from "axios";

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

// ERC721 ABI for balanceOf
const ERC721_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

/**
 * Check NFT ownership via OpenSea API (fallback method)
 */
async function checkViaOpenSea(walletAddress: string): Promise<boolean> {
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

    console.log("✅ OpenSea API check result:", {
      walletAddress,
      contractAddress: CONTRACT_ADDRESS,
      totalNFTs: nfts.length,
      matchingNFTs: matchingNFTs.length,
      hasNFT,
      sampleNFT: matchingNFTs[0] ? {
        identifier: matchingNFTs[0].identifier,
        contract: matchingNFTs[0].contract || matchingNFTs[0].contract_address,
      } : null,
    });

    return hasNFT;
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

      console.log("✅ Contract check result:", {
        walletAddress: normalizedAddress,
        balance,
        hasNFT,
      });
    } catch (error: any) {
      console.warn("⚠️ Contract check failed, trying OpenSea API:", {
        error: error.message,
        code: error.code,
      });
      
      // Fallback to OpenSea API
      try {
        hasNFT = await checkViaOpenSea(normalizedAddress);
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
    });
  } catch (error: any) {
    console.error("Error in check-nft endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

