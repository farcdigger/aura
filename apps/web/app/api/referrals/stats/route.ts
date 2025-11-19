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

    const normalizedWallet = wallet.toLowerCase().trim();

    console.log("🔍 Fetching referral stats for wallet:", normalizedWallet);

    // Get total referrals count (both sides are lowercase)
    const { count, error: countError } = await (client as any)
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_wallet", normalizedWallet);

    console.log("📊 Referrals count result:", { count, error: countError });

    // Get total earnings (credits + USDC)
    const { data: earnings, error: earningsError } = await (client as any)
      .from("referrals")
      .select("reward_credits, reward_usdc, status, usdc_paid_at")
      .eq("referrer_wallet", normalizedWallet);

    console.log("💰 Earnings data:", { 
      earnings, 
      error: earningsError,
      count: earnings?.length 
    });
      
    const earningsData = earnings as Array<{ 
      reward_credits: number; 
      reward_usdc: number;
      status: string;
      usdc_paid_at: string | null;
    }> | null;
    
    // Credits: Only count completed referrals
    const totalCreditsEarned = earningsData?.reduce((sum, ref) => {
      return ref.status === 'completed' ? sum + (Number(ref.reward_credits) || 0) : sum;
    }, 0) || 0;
    
    const pendingCredits = earningsData?.reduce((sum, ref) => {
      return ref.status === 'pending' ? sum + (Number(ref.reward_credits) || 0) : sum;
    }, 0) || 0;

    // USDC: All completed referrals (paid or pending payment)
    const totalUsdcEarned = earningsData?.reduce((sum, ref) => {
      // Only count if status is 'completed' or 'paid'
      return (ref.status === 'completed' || ref.status === 'paid') 
        ? sum + (Number(ref.reward_usdc) || 0) 
        : sum;
    }, 0) || 0;

    // USDC already paid
    const usdcPaid = earningsData?.reduce((sum, ref) => {
      return ref.usdc_paid_at ? sum + (Number(ref.reward_usdc) || 0) : sum;
    }, 0) || 0;

    // USDC pending payment
    const usdcPending = totalUsdcEarned - usdcPaid;

    // Get referral code (lowercase match)
    const { data: codeData } = await (client as any)
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", normalizedWallet)
      .single();

    const code = codeData as { code: string } | null;

    return NextResponse.json({
      referralCode: code?.code || null,
      totalReferrals: count || 0,
      totalCreditsEarned,
      pendingCredits,
      totalUsdcEarned,
      usdcPaid,
      usdcPending
    });

  } catch (error: any) {
    console.error("Referral stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

