import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refereeWallet, referralCode } = body;

    if (!refereeWallet || !referralCode) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const client = supabaseClient;
    if (!client) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const normalizedReferee = refereeWallet.toLowerCase();

    // 1. Find referrer wallet from code
    const { data: codeData } = await client
      .from("referral_codes")
      .select("wallet_address")
      .eq("code", referralCode)
      .single();

    if (!codeData) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    const referrerWallet = codeData.wallet_address;

    // 2. Prevent self-referral
    if (referrerWallet === normalizedReferee) {
      return NextResponse.json({ error: "Self-referral not allowed" }, { status: 400 });
    }

    // 3. Check if referee already referred (unique constraint will handle, but checking is nice)
    // Insert referral record
    const { error } = await client
      .from("referrals")
      .insert({
        referrer_wallet: referrerWallet,
        referee_wallet: normalizedReferee,
        status: "pending",
        reward_amount: 0.50
      });

    if (error) {
      // If unique constraint violation (already referred), just ignore
      if (error.code === '23505') {
        return NextResponse.json({ success: false, message: "Already referred" });
      }
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Referral track error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

