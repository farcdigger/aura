import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

/**
 * Track referral by X user ID (called after mint)
 * This endpoint checks pending_referrals table and awards rewards
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { x_user_id, wallet } = body;

    if (!x_user_id || !wallet) {
      return NextResponse.json({ error: "Missing x_user_id or wallet" }, { status: 400 });
    }

    const client = supabaseClient;
    if (!client) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const normalizedWallet = wallet.toLowerCase().trim();

    console.log("🔍 Looking for pending referral:", { x_user_id, wallet: normalizedWallet });

    // 1. Check pending_referrals table
    const { data: pendingRef } = await (client as any)
      .from("pending_referrals")
      .select("referral_code")
      .eq("x_user_id", x_user_id)
      .single();

    const pendingData = pendingRef as { referral_code: string } | null;

    if (!pendingData) {
      console.log("ℹ️ No pending referral found for x_user_id:", x_user_id);
      return NextResponse.json({ success: false, message: "No pending referral" });
    }

    const referralCode = pendingData.referral_code;
    console.log("✅ Found pending referral code:", referralCode);

    // 2. Find referrer wallet from code
    const { data: codeData } = await (client as any)
      .from("referral_codes")
      .select("wallet_address")
      .eq("code", referralCode)
      .single();

    const referrerData = codeData as { wallet_address: string } | null;

    if (!referrerData) {
      console.error("❌ Referral code not found:", referralCode);
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    // IMPORTANT: Normalize referrer wallet to lowercase and trim whitespace
    const referrerWallet = referrerData.wallet_address.toLowerCase().trim();

    // 3. Prevent self-referral
    if (referrerWallet === normalizedWallet) {
      console.log("⚠️ Self-referral attempt blocked");
      // Delete pending referral
      await (client as any)
        .from("pending_referrals")
        .delete()
        .eq("x_user_id", x_user_id);
      return NextResponse.json({ error: "Self-referral not allowed" }, { status: 400 });
    }

    // 4. Check if already referred
    const { count: existingCount } = await (client as any)
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referee_wallet", normalizedWallet);

    if (existingCount && existingCount > 0) {
      console.log("ℹ️ User already referred, cleaning up pending referral");
      // Delete pending referral
      await (client as any)
        .from("pending_referrals")
        .delete()
        .eq("x_user_id", x_user_id);
      return NextResponse.json({ success: false, message: "Already referred" });
    }

    // 5. Insert referral record
    const { error: insertError } = await (client as any)
      .from("referrals")
      .insert({
        referrer_wallet: referrerWallet,
        referee_wallet: normalizedWallet,
        status: "pending",
        reward_credits: 50000,
        reward_usdc: 0.25
      });

    if (insertError) {
      console.error("❌ Referral insert error:", insertError);
      throw insertError;
    }

    console.log("✅ Referral record created");

    // 6. Award 50,000 credits to referrer IMMEDIATELY
    try {
      const { data: referrerBalance } = await (client as any)
        .from("chat_tokens")
        .select("balance, wallet_address")
        .eq("wallet_address", referrerWallet)
        .single();

      const balanceData = referrerBalance as { balance: number; wallet_address: string } | null;

      if (balanceData) {
        // Update existing balance
        await (client as any)
          .from("chat_tokens")
          .update({
            balance: (balanceData.balance || 0) + 50000,
            updated_at: new Date().toISOString()
          })
          .eq("wallet_address", referrerWallet);
      } else {
        // Create new record
        await (client as any)
          .from("chat_tokens")
          .insert({
            wallet_address: referrerWallet,
            balance: 50000,
            points: 0,
            total_tokens_spent: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }

      // Mark referral as completed
      await (client as any)
        .from("referrals")
        .update({
          status: "completed",
          rewarded_at: new Date().toISOString()
        })
        .eq("referee_wallet", normalizedWallet);

      console.log(`🎉 Referral reward awarded: ${referrerWallet} received 50,000 credits`);
    } catch (rewardError) {
      console.error("❌ Error awarding referral credits:", rewardError);
      // Don't fail the request if reward fails
    }

    // 7. Delete pending referral (cleanup)
    await (client as any)
      .from("pending_referrals")
      .delete()
      .eq("x_user_id", x_user_id);

    console.log("🗑️ Pending referral cleaned up");

    return NextResponse.json({ 
      success: true, 
      referrer: referrerWallet,
      credits_awarded: 50000,
      usdc_pending: 0.25
    });

  } catch (error: any) {
    console.error("❌ Referral tracking error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

