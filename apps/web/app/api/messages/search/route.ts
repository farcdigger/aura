import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/search
 * Search for users by wallet address
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q");
    const currentWallet = request.nextUrl.searchParams.get("wallet");

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    if (!currentWallet) {
      return NextResponse.json(
        { error: "Current wallet address is required" },
        { status: 400 }
      );
    }

    if (!supabaseClient) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    const normalizedQuery = query.toLowerCase().trim();
    const normalizedCurrentWallet = currentWallet.toLowerCase();

    // Validate wallet address format (basic check)
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(normalizedQuery);
    
    if (!isValidAddress) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    // Don't allow searching for yourself
    if (normalizedQuery === normalizedCurrentWallet) {
      return NextResponse.json(
        { error: "Cannot search for your own wallet address" },
        { status: 400 }
      );
    }

    // Check if user has NFT (from tokens table)
    const { data: tokenData } = await supabaseClient
      .from("tokens")
      .select("token_id, image_uri, wallet_address")
      .eq("wallet_address", normalizedQuery)
      .limit(1)
      .single();

    // Check if user exists in users table
    const { data: userData } = await supabaseClient
      .from("users")
      .select("x_user_id, username, profile_image_url, wallet_address")
      .eq("wallet_address", normalizedQuery)
      .limit(1)
      .single();

    // Check if there's an existing conversation between these two wallets
    // We need to check both possible orderings (wallet1-wallet2 or wallet2-wallet1)
    const [wallet1, wallet2] = 
      normalizedQuery < normalizedCurrentWallet 
        ? [normalizedQuery, normalizedCurrentWallet]
        : [normalizedCurrentWallet, normalizedQuery];

    const { data: existingConv } = await supabaseClient
      .from("conversations")
      .select("id")
      .eq("participant1_wallet", wallet1)
      .eq("participant2_wallet", wallet2)
      .limit(1)
      .maybeSingle();

    const token = tokenData as { token_id: number; image_uri: string; wallet_address: string } | null;
    const user = userData as { x_user_id: string; username: string; profile_image_url: string | null; wallet_address: string } | null;
    const conv = existingConv as { id: string } | null;

    return NextResponse.json({
      wallet: normalizedQuery,
      hasNFT: !!token,
      tokenId: token?.token_id || null,
      nftImageUrl: token?.image_uri || null,
      username: user?.username || null,
      profileImageUrl: user?.profile_image_url || null,
      hasExistingConversation: !!conv,
      conversationId: conv?.id || null,
    });
  } catch (error: any) {
    console.error("Error in search API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
