import { NextRequest, NextResponse } from "next/server";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";

// Debug endpoint to test database queries
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const x_user_id = searchParams.get("x_user_id") || "1885792025502765056";

    // Test 1: Query without condition (get all tokens)
    const allTokens = await db
      .select()
      .from(tokens)
      .limit(10);

    // Test 2: Query with condition (get specific user's token)
    const userToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.x_user_id, x_user_id))
      .limit(1);

    // Test 3: Check what eq() condition looks like
    const condition = eq(tokens.x_user_id, x_user_id);
    
    return NextResponse.json({
      testQuery: {
        x_user_id,
        allTokensCount: allTokens.length,
        allTokens: allTokens.map(t => ({
          id: t.id,
          x_user_id: t.x_user_id,
          token_id: t.token_id,
        })),
        userTokenCount: userToken.length,
        userToken: userToken.length > 0 ? {
          id: userToken[0].id,
          x_user_id: userToken[0].x_user_id,
          token_id: userToken[0].token_id,
        } : null,
        conditionStructure: {
          keys: Object.keys(condition),
          hasColumn: !!condition._column,
          hasValue: condition._value !== undefined,
          columnName: condition._column?.name || condition._column?._?.name,
          value: condition._value?.value ?? condition._value,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Query test error:", error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

