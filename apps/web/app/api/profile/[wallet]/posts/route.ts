import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * GET /api/profile/[wallet]/posts
 * Get posts by a specific wallet address
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const wallet = params.wallet?.toLowerCase();
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

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

    // Get posts by wallet address
    const { data: posts, error } = await supabaseClient
      .from("posts")
      .select("*")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Get x_user_id for each post's wallet (for NFT image lookup)
    const walletAddresses = [...new Set(posts?.map(p => p.wallet_address) || [])];
    const { data: usersData } = await supabaseClient
      .from("users")
      .select("wallet_address, x_user_id")
      .in("wallet_address", walletAddresses);

    const walletToXUserId: Record<string, string | null> = {};
    usersData?.forEach(user => {
      walletToXUserId[user.wallet_address] = user.x_user_id || null;
    });

    // Add x_user_id to posts
    const postsWithXUserId = posts?.map(post => ({
      ...post,
      x_user_id: walletToXUserId[post.wallet_address] || null,
    })) || [];

    return NextResponse.json({
      posts: postsWithXUserId,
      total: postsWithXUserId.length,
    });
  } catch (error: any) {
    console.error("Error in profile posts API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

