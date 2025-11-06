/**
 * Update Token ID API
 * 
 * Mint başarılı olduktan sonra token_id, tx_hash ve status'u günceller
 * STATUS: 'generated' → 'paid' → 'minted'
 */

import { NextRequest, NextResponse } from "next/server";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { isMockMode } from "@/env.mjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { x_user_id, token_id, transaction_hash } = body;

    console.log("🔄 Update token_id request:", {
      x_user_id,
      token_id,
      transaction_hash: transaction_hash?.substring(0, 20) + "...",
    });

    // Validation
    if (!x_user_id || token_id === undefined || token_id === null) {
      return NextResponse.json(
        { error: "Missing required fields: x_user_id, token_id" },
        { status: 400 }
      );
    }

    // Update token in database with FULL mint data
    if (!isMockMode && db) {
      try {
        const result = await db
          .update(tokens)
          .set({
            token_id: Number(token_id),
            tx_hash: transaction_hash || null,
            status: "minted", // ✅ Status: minted!
          })
          .where(eq(tokens.x_user_id, x_user_id));

        console.log("✅ Token ID + TX Hash + Status updated:", {
          x_user_id,
          token_id: Number(token_id),
          tx_hash: transaction_hash?.substring(0, 20) + "...",
          status: "minted",
        });

        return NextResponse.json({
          success: true,
          x_user_id,
          token_id: Number(token_id),
          tx_hash: transaction_hash,
          status: "minted",
        });
      } catch (dbError) {
        console.error("❌ Database update error:", dbError);
        return NextResponse.json(
          {
            error: "Database update failed",
            message: String(dbError),
          },
          { status: 500 }
        );
      }
    }

    // Mock mode
    console.log("⚠️ Mock mode: Database update skipped");
    return NextResponse.json({
      success: true,
      x_user_id,
      token_id: Number(token_id),
      mock: true,
    });
  } catch (error) {
    console.error("❌ Update token_id error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: String(error),
      },
      { status: 500 }
    );
  }
}

