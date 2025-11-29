import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * POST /api/profile/[wallet]/follow
 * Follow or unfollow a user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const wallet = params.wallet?.toLowerCase();
    const body = await request.json();
    const currentWallet = body.currentWallet?.toLowerCase();
    const action = body.action; // "follow" or "unfollow"

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    if (!currentWallet) {
      return NextResponse.json(
        { error: "Current wallet address is required" },
        { status: 400 }
      );
    }

    if (wallet === currentWallet) {
      return NextResponse.json(
        { error: "Cannot follow yourself" },
        { status: 400 }
      );
    }

    if (!supabaseClient) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    if (action === "follow") {
      // Insert follow relationship
      const { data, error } = await supabaseClient
        .from("follows")
        .insert({
          follower_wallet: currentWallet,
          following_wallet: wallet,
        })
        .select()
        .single();

      if (error) {
        // If already following, that's okay
        if (error.code === '23505') { // Unique violation
          return NextResponse.json({ success: true, message: "Already following" });
        }
        throw error;
      }

      return NextResponse.json({ success: true, message: "Followed successfully" });
    } else if (action === "unfollow") {
      // Delete follow relationship
      const { error } = await supabaseClient
        .from("follows")
        .delete()
        .eq("follower_wallet", currentWallet)
        .eq("following_wallet", wallet);

      if (error) {
        throw error;
      }

      return NextResponse.json({ success: true, message: "Unfollowed successfully" });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'follow' or 'unfollow'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in follow API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

