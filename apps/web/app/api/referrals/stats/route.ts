import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ error: "Wallet required" }, { status: 400 });
    }

    const client = supabaseClient;
    if (!client) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const normalizedWallet = wallet.toLowerCase();

    // Get total referrals count
    const { count } = await client
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_wallet", normalizedWallet);

    // Get total earnings (assuming 0.50 per referral)
    // Or sum reward_amount column
    const { data: earnings } = await client
      .from("referrals")
      .select("reward_amount")
      .eq("referrer_wallet", normalizedWallet);
      
    const totalEarned = earnings?.reduce((sum, ref) => sum + (Number(ref.reward_amount) || 0), 0) || 0;

    // Get referral code
    const { data: codeData } = await client
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", normalizedWallet)
      .single();

    return NextResponse.json({
      referralCode: codeData?.code || null,
      totalReferrals: count || 0,
      totalEarnings: totalEarned,
      pendingPayment: totalEarned // Assuming all are pending for manual payment
    });

  } catch (error: any) {
    console.error("Referral stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

