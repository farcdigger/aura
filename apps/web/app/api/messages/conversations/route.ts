import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/conversations
 * Get all conversations for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get wallet address from query parameter
    const walletAddress = request.nextUrl.searchParams.get("wallet");
    
    if (!walletAddress) {
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

    // Normalize wallet address
    const normalizedWallet = walletAddress.toLowerCase();

    // Get all conversations where user is a participant
    const { data: conversations, error } = await supabaseClient
      .from("conversations")
      .select("*")
      .or(`participant1_wallet.eq.${normalizedWallet},participant2_wallet.eq.${normalizedWallet}`)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // For each conversation, get the other participant's info
    const conversationsWithParticipants = await Promise.all(
      (conversations || []).map(async (conv: any) => {
        const conversation = conv as {
          id: string;
          participant1_wallet: string;
          participant2_wallet: string;
          last_message_at: string | null;
          created_at: string | null;
        };

        const otherParticipant =
          conversation.participant1_wallet.toLowerCase() === normalizedWallet
            ? conversation.participant2_wallet
            : conversation.participant1_wallet;

        // Get unread message count
        const { count: unreadCount } = await supabaseClient
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conversation.id)
          .eq("receiver_wallet", normalizedWallet)
          .eq("read", false);

        return {
          id: conversation.id,
          otherParticipant: otherParticipant,
          lastMessageAt: conversation.last_message_at,
          createdAt: conversation.created_at,
          unreadCount: unreadCount || 0,
        };
      })
    );

    return NextResponse.json({
      conversations: conversationsWithParticipants,
    });
  } catch (error: any) {
    console.error("Error in conversations API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
