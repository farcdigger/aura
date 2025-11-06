import { NextRequest, NextResponse } from "next/server";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const x_user_id = searchParams.get("x_user_id");
  
  if (!x_user_id) {
    return NextResponse.json({ error: "Missing x_user_id" }, { status: 400 });
  }
  
  console.log("🐛 Debug request for x_user_id:", x_user_id);
  
  const result = await db
    .select()
    .from(tokens)
    .where(eq(tokens.x_user_id, x_user_id))
    .limit(1);
    
  const data = result[0] || null;
  
  return NextResponse.json({
    found: result.length > 0,
    data: {
      x_user_id: data?.x_user_id,
      token_id: data?.token_id,
      status: data?.status,
      tx_hash: data?.tx_hash,
      has_image: !!data?.image_uri,
      has_metadata: !!data?.metadata_uri,
    },
    raw: data,
  });
}

