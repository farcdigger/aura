import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/db-supabase";
import { MESSAGING_RATE_LIMITS } from "@/lib/feature-flags";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

/**
 * POST /api/messages/send
 * Send a message with rate limiting
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { senderWallet, receiverWallet, content } = body;

    // Validation
    if (!senderWallet || !receiverWallet || !content) {
      return NextResponse.json(
        { error: "Missing required fields: senderWallet, receiverWallet, content" },
        { status: 400 }
      );
    }

    if (content.length > MESSAGING_RATE_LIMITS.MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long. Maximum ${MESSAGING_RATE_LIMITS.MAX_MESSAGE_LENGTH} characters allowed.` },
        { status: 400 }
      );
    }

    if (senderWallet.toLowerCase() === receiverWallet.toLowerCase()) {
      return NextResponse.json(
        { error: "Cannot send message to yourself" },
        { status: 400 }
      );
    }

    const client = supabaseClient;

    if (!client) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    const normalizedSender = senderWallet.toLowerCase();
    const normalizedReceiver = receiverWallet.toLowerCase();

    // Check rate limiting
    const rateLimitCheck = await checkRateLimit(normalizedSender, client);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { 
          error: rateLimitCheck.message,
          retryAfter: rateLimitCheck.retryAfter 
        },
        { status: 429 }
      );
    }

    // Get or create conversation
    const conversationId = await getOrCreateConversation(
      normalizedSender,
      normalizedReceiver,
      client
    );

    if (!conversationId) {
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }

    // Insert message
    const { data: message, error: messageError } = await (client as any)
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_wallet: normalizedSender,
        receiver_wallet: normalizedReceiver,
        content: content.trim(),
        read: false,
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error inserting message:", messageError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Type assertion for message
    const msg = message as {
      id: string;
      conversation_id: string;
      sender_wallet: string;
      receiver_wallet: string;
      content: string;
      read: boolean;
      created_at: string;
    };

    // Update conversation's last_message_at (trigger should handle this, but just in case)
    await (client as any)
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      success: true,
      message: {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderWallet: msg.sender_wallet,
        receiverWallet: msg.receiver_wallet,
        content: msg.content,
        read: msg.read,
        createdAt: msg.created_at,
      },
    });
  } catch (error: any) {
    console.error("Error in send message API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Check rate limit for a wallet address
 */
async function checkRateLimit(walletAddress: string, client: SupabaseClient<any>): Promise<{
  allowed: boolean;
  message?: string;
  retryAfter?: number;
}> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Get or create rate limit record
  const { data: rateLimit, error: fetchError } = await client
    .from("message_rate_limits")
    .select("*")
    .eq("wallet_address", walletAddress)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = no rows returned, which is fine for new users
    console.error("Error fetching rate limit:", fetchError);
    return { allowed: false, message: "Rate limit check failed" };
  }

  // If no record exists, create one
  if (!rateLimit) {
    await (client as any)
      .from("message_rate_limits")
      .insert({
        wallet_address: walletAddress,
        messages_sent_minute: 1,
        messages_sent_hour: 1,
        last_minute_reset: now.toISOString(),
        last_hour_reset: now.toISOString(),
      });
    return { allowed: true };
  }

  // Check minute limit
  const lastMinuteReset = new Date(rateLimit.last_minute_reset || 0);
  let messagesSentMinute = rateLimit.messages_sent_minute || 0;

  if (lastMinuteReset < oneMinuteAgo) {
    // Reset minute counter
    messagesSentMinute = 0;
  }

  if (messagesSentMinute >= MESSAGING_RATE_LIMITS.MESSAGES_PER_MINUTE) {
    const retryAfter = Math.ceil(
      (60 - (now.getTime() - lastMinuteReset.getTime()) / 1000)
    );
    return {
      allowed: false,
      message: `Rate limit exceeded. Maximum ${MESSAGING_RATE_LIMITS.MESSAGES_PER_MINUTE} messages per minute.`,
      retryAfter,
    };
  }

  // Check hour limit
  const lastHourReset = new Date(rateLimit.last_hour_reset || 0);
  let messagesSentHour = rateLimit.messages_sent_hour || 0;

  if (lastHourReset < oneHourAgo) {
    // Reset hour counter
    messagesSentHour = 0;
  }

  if (messagesSentHour >= MESSAGING_RATE_LIMITS.MESSAGES_PER_HOUR) {
    const retryAfter = Math.ceil(
      (3600 - (now.getTime() - lastHourReset.getTime()) / 1000)
    );
    return {
      allowed: false,
      message: `Rate limit exceeded. Maximum ${MESSAGING_RATE_LIMITS.MESSAGES_PER_HOUR} messages per hour.`,
      retryAfter,
    };
  }

  // Update rate limit counters
  const updateData: any = {
    updated_at: now.toISOString(),
  };

  if (lastMinuteReset < oneMinuteAgo) {
    updateData.messages_sent_minute = 1;
    updateData.last_minute_reset = now.toISOString();
  } else {
    updateData.messages_sent_minute = messagesSentMinute + 1;
  }

  if (lastHourReset < oneHourAgo) {
    updateData.messages_sent_hour = 1;
    updateData.last_hour_reset = now.toISOString();
  } else {
    updateData.messages_sent_hour = messagesSentHour + 1;
  }

  await (client as any)
    .from("message_rate_limits")
    .update(updateData)
    .eq("wallet_address", walletAddress);

  return { allowed: true };
}

/**
 * Get or create a conversation between two wallets
 */
async function getOrCreateConversation(
  wallet1: string,
  wallet2: string,
  client: SupabaseClient<any>
): Promise<string | null> {

  // Sort wallets to ensure consistent ordering
  const [participant1, participant2] = 
    wallet1 < wallet2 ? [wallet1, wallet2] : [wallet2, wallet1];

  // Try to find existing conversation
  const { data: existing, error: fetchError } = await (client as any)
    .from("conversations")
    .select("id")
    .eq("participant1_wallet", participant1)
    .eq("participant2_wallet", participant2)
    .single();

  if (existing) {
    return (existing as { id: string }).id;
  }

  // Create new conversation
  const { data: newConv, error: insertError } = await (client as any)
    .from("conversations")
    .insert({
      participant1_wallet: participant1,
      participant2_wallet: participant2,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Error creating conversation:", insertError);
    return null;
  }

  return (newConv as { id: string }).id;
}
