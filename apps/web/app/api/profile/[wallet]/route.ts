import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * GET /api/profile/[wallet]
 * Get user profile information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const wallet = params.wallet?.toLowerCase();
    const currentWallet = request.nextUrl.searchParams.get("currentWallet")?.toLowerCase();

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    if (!supabaseClient) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    // Get user info from users table
    const { data: userData } = await supabaseClient
      .from("users")
      .select("x_user_id, username, profile_image_url, wallet_address")
      .eq("wallet_address", wallet)
      .limit(1)
      .maybeSingle();

    // Get NFT info from tokens table
    const { data: tokenData } = await supabaseClient
      .from("tokens")
      .select("token_id, image_uri, wallet_address")
      .eq("wallet_address", wallet)
      .limit(1)
      .maybeSingle();

    // If no token by wallet, try by x_user_id
    let nftData = tokenData;
    if (!nftData && userData?.x_user_id) {
      const { data: tokenByXUserId } = await supabaseClient
        .from("tokens")
        .select("token_id, image_uri, x_user_id")
        .eq("x_user_id", userData.x_user_id)
        .limit(1)
        .maybeSingle();
      nftData = tokenByXUserId;
    }

    // Get post count
    const { count: postCount } = await supabaseClient
      .from("posts")
      .select("*", { count: 'exact', head: true })
      .eq("wallet_address", wallet);

    // Get follower count
    const { count: followerCount } = await supabaseClient
      .from("follows")
      .select("*", { count: 'exact', head: true })
      .eq("following_wallet", wallet);

    // Get following count
    const { count: followingCount } = await supabaseClient
      .from("follows")
      .select("*", { count: 'exact', head: true })
      .eq("follower_wallet", wallet);

    // Check if current user is following this user
    let isFollowing = false;
    if (currentWallet && currentWallet !== wallet) {
      const { data: followData } = await supabaseClient
        .from("follows")
        .select("id")
        .eq("follower_wallet", currentWallet)
        .eq("following_wallet", wallet)
        .limit(1)
        .maybeSingle();
      isFollowing = !!followData;
    }

    return NextResponse.json({
      wallet,
      username: userData?.username || null,
      profileImageUrl: userData?.profile_image_url || nftData?.image_uri || null,
      nftTokenId: nftData?.token_id || null,
      nftImageUrl: nftData?.image_uri || null,
      postCount: postCount || 0,
      followerCount: followerCount || 0,
      followingCount: followingCount || 0,
      isFollowing,
      isOwnProfile: currentWallet === wallet,
    });
  } catch (error: any) {
    console.error("Error in profile API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

