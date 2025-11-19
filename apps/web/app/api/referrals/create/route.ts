import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

export const dynamic = 'force-dynamic';

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

const ERC721_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    const client = supabaseClient;
    if (!client) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const normalizedWallet = walletAddress.toLowerCase();

    // ✅ Check if user owns an NFT via blockchain (required to create referral link)
    if (process.env.NODE_ENV !== "development") {
      const DEVELOPER_WALLET = "0xEdf8e693b3ab4899a03aB22eDF90E36a6AC1Fd9d";
      
      if (normalizedWallet.toLowerCase() !== DEVELOPER_WALLET.toLowerCase()) {
        try {
          const provider = new ethers.JsonRpcProvider(RPC_URL);
          const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
          
          const normalizedAddress = ethers.getAddress(walletAddress);
          const balanceResult = await contract.balanceOf(normalizedAddress);
          const hasNFT = balanceResult > 0n;
          
          console.log("🔍 NFT ownership check for referral link:", {
            wallet: normalizedAddress,
            balance: balanceResult.toString(),
            hasNFT,
          });
          
          if (!hasNFT) {
            return NextResponse.json(
              { error: "You must own an xFrora NFT to create a referral link." },
              { status: 403 }
            );
          }
        } catch (error: any) {
          console.error("❌ Error checking NFT ownership:", error);
          return NextResponse.json(
            { error: "Failed to verify NFT ownership. Please try again." },
            { status: 500 }
          );
        }
      }
    }

    // Check if code already exists
    const { data: existing } = await (client as any)
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", normalizedWallet)
      .single();

    const existingCode = existing as { code: string } | null;

    if (existingCode) {
      return NextResponse.json({ code: existingCode.code });
    }

    // Create new unique code (last 6 chars of wallet + random string if needed)
    // Simple version: 'ref_' + last 6 chars of wallet
    const code = `ref_${normalizedWallet.slice(-6)}`;

    // Insert
    const { data, error } = await (client as any)
      .from("referral_codes")
      .insert({
        wallet_address: normalizedWallet,
        code: code
      })
      .select("code")
      .single();

    const insertedCode = data as { code: string } | null;

    if (error) {
      // Handle duplicate code edge case by appending random char
      if (error.code === '23505') { // Unique constraint violation
         const randomSuffix = Math.floor(Math.random() * 1000);
         const newCode = `ref_${normalizedWallet.slice(-6)}${randomSuffix}`;
         const { data: retryData, error: retryError } = await (client as any)
            .from("referral_codes")
            .insert({
                wallet_address: normalizedWallet,
                code: newCode
            })
            .select("code")
            .single();
            
         const retryCode = retryData as { code: string } | null;
         if (retryError) throw retryError;
         return NextResponse.json({ code: retryCode?.code });
      }
      throw error;
    }

    return NextResponse.json({ code: insertedCode?.code });

  } catch (error: any) {
    console.error("Referral create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

