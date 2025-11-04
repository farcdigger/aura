import { NextRequest, NextResponse } from "next/server";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";

// Admin endpoint to delete a user's NFT (for testing/debugging)
// In production, add authentication/authorization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { x_user_id } = body;

    if (!x_user_id) {
      return NextResponse.json({ error: "Missing x_user_id parameter" }, { status: 400 });
    }

    // Check if token exists
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.x_user_id, x_user_id))
      .limit(1);

    if (existingToken.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No NFT found for this user",
        x_user_id,
      });
    }

    // Delete token (using Supabase REST API)
    // Note: Supabase client doesn't have direct delete in our wrapper, so we'll use the client directly
    const { supabaseClient } = await import("@/lib/db-supabase");
    
    if (!supabaseClient) {
      return NextResponse.json({ error: "Supabase client not available" }, { status: 500 });
    }

    const client = supabaseClient as any;
    const { data, error } = await client
      .from("tokens")
      .delete()
      .eq("x_user_id", x_user_id)
      .select()
      .single();

    if (error) {
      console.error("Delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "NFT deleted successfully",
      x_user_id,
      deletedToken: data?.[0],
    });
  } catch (error: any) {
    console.error("Delete NFT error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete NFT" }, { status: 500 });
  }
}

