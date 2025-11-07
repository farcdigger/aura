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
import { createClient } from "@supabase/supabase-js";

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

    let updateResult: any = null;

    if (!isMockMode) {
      try {
        updateResult = await db
          .update(tokens)
          .set({
            token_id: Number(token_id),
            tx_hash: transaction_hash || null,
            status: "minted",
          })
          .where(eq(tokens.x_user_id, x_user_id));
        console.log("✅ Token ID updated via db facade", { x_user_id, token_id });
      } catch (dbError) {
        console.warn("⚠️ db.update fallback failed, attempting direct Supabase update", dbError);
      }

      if (updateResult?.length === 0 || !updateResult) {
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Supabase credentials missing");
          }

          const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false },
          });

          const { error } = await supabase
            .from("tokens")
            .update({
              token_id: Number(token_id),
              tx_hash: transaction_hash || null,
              status: "minted",
            })
            .eq("x_user_id", x_user_id);

          if (error) {
            console.error("❌ Supabase REST update error:", error);
            return NextResponse.json({
              error: "Database update failed",
              message: error.message,
            }, { status: 500 });
          }

          console.log("✅ Token ID updated via Supabase REST", { x_user_id, token_id });
        } catch (restError) {
          console.error("❌ Database update failed via REST fallback:", restError);
          return NextResponse.json(
            {
              error: "Database update failed",
              message: String(restError),
            },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        x_user_id,
        token_id: Number(token_id),
        tx_hash: transaction_hash,
        status: "minted",
      });
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

