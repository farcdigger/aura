import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";

const ERC721_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
];

/**
 * Check NFT ownership server-side
 */
async function checkNFTOwnership(walletAddress: string): Promise<{ hasNFT: boolean; tokenId: number | null }> {
  try {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return { hasNFT: false, tokenId: null };
    }

    const normalizedAddress = ethers.getAddress(walletAddress);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
    
    const balanceResult = await contract.balanceOf(normalizedAddress);
    const hasNFT = balanceResult > 0n;

    if (!hasNFT) {
      return { hasNFT: false, tokenId: null };
    }

    // Get the first token ID
    const firstTokenId = await contract.tokenOfOwnerByIndex(normalizedAddress, 0);
    const tokenId = Number(firstTokenId);

    return { hasNFT: true, tokenId };
  } catch (error: any) {
    console.error("Error checking NFT ownership:", error);
    return { hasNFT: false, tokenId: null };
  }
}

/**
 * POST /api/profile/create
 * Create a profile for a wallet address (requires NFT ownership)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    if (!supabaseClient) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    const normalizedWallet = walletAddress.toLowerCase();

    // Check NFT ownership
    const { hasNFT, tokenId } = await checkNFTOwnership(walletAddress);
    
    if (!hasNFT) {
      return NextResponse.json(
        { error: "NFT ownership required to create a profile" },
        { status: 403 }
      );
    }

    // Check if user already exists by wallet_address
    const { data: existingUser } = await supabaseClient
      .from("users")
      .select("id, x_user_id, username, wallet_address")
      .eq("wallet_address", normalizedWallet)
      .limit(1)
      .maybeSingle();

    if (existingUser) {
      // User already exists, return success
      return NextResponse.json({
        success: true,
        message: "Profile already exists",
        user: {
          wallet: normalizedWallet,
          username: existingUser.username,
          x_user_id: existingUser.x_user_id,
        },
      });
    }

    // Generate username from wallet address (first 6 chars + last 4 chars)
    const username = `${normalizedWallet.substring(0, 6)}...${normalizedWallet.substring(38)}`;

    // Create a unique x_user_id for wallet-only users (format: wallet_0x...)
    const x_user_id = `wallet_${normalizedWallet}`;

    // Check if x_user_id already exists
    const { data: existingXUser } = await supabaseClient
      .from("users")
      .select("id")
      .eq("x_user_id", x_user_id)
      .limit(1)
      .maybeSingle();

    if (existingXUser) {
      // Update existing user with wallet address
      const { data: updatedUser, error: updateError } = await supabaseClient
        .from("users")
        .update({
          wallet_address: normalizedWallet,
          username: username,
          updated_at: new Date().toISOString(),
        })
        .eq("x_user_id", x_user_id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({
        success: true,
        message: "Profile created successfully",
        user: {
          wallet: normalizedWallet,
          username: updatedUser.username,
          x_user_id: updatedUser.x_user_id,
        },
      });
    }

    // Insert new user
    const { data: newUser, error: insertError } = await supabaseClient
      .from("users")
      .insert({
        x_user_id: x_user_id,
        username: username,
        wallet_address: normalizedWallet,
        profile_image_url: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating profile:", insertError);
      return NextResponse.json(
        { error: "Failed to create profile", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Profile created successfully",
      user: {
        wallet: normalizedWallet,
        username: newUser.username,
        x_user_id: newUser.x_user_id,
      },
    });
  } catch (error: any) {
    console.error("Error in profile create API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

