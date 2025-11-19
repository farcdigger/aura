import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

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

    // Check if code already exists
    const { data: existing } = await client
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", normalizedWallet)
      .single();

    if (existing) {
      return NextResponse.json({ code: existing.code });
    }

    // Create new unique code (last 6 chars of wallet + random string if needed)
    // Simple version: 'ref_' + last 6 chars of wallet
    const code = `ref_${normalizedWallet.slice(-6)}`;

    // Insert
    const { data, error } = await client
      .from("referral_codes")
      .insert({
        wallet_address: normalizedWallet,
        code: code
      })
      .select("code")
      .single();

    if (error) {
      // Handle duplicate code edge case by appending random char
      if (error.code === '23505') { // Unique constraint violation
         const randomSuffix = Math.floor(Math.random() * 1000);
         const newCode = `ref_${normalizedWallet.slice(-6)}${randomSuffix}`;
         const { data: retryData, error: retryError } = await client
            .from("referral_codes")
            .insert({
                wallet_address: normalizedWallet,
                code: newCode
            })
            .select("code")
            .single();
            
         if (retryError) throw retryError;
         return NextResponse.json({ code: retryData.code });
      }
      throw error;
    }

    return NextResponse.json({ code: data.code });

  } catch (error: any) {
    console.error("Referral create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

