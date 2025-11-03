import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, verifyXToken } from "@/lib/x";
import { env } from "@/env.mjs";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  
  // Check if X OAuth is configured
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_CALLBACK_URL) {
    return NextResponse.json({ error: "X OAuth not configured" }, { status: 500 });
  }
  
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  
  try {
    const tokenResponse = await exchangeCodeForToken(
      code,
      env.X_CLIENT_ID,
      env.X_CLIENT_SECRET,
      env.X_CALLBACK_URL
    );
    
    if (!tokenResponse) {
      return NextResponse.json({ error: "Failed to exchange token" }, { status: 401 });
    }
    
    const xUser = await verifyXToken(tokenResponse.access_token);
    
    if (!xUser) {
      return NextResponse.json({ error: "Failed to verify user" }, { status: 401 });
    }
    
    // Store user in database (simplified - adjust based on your schema)
    // await db.insert(users).values({
    //   x_user_id: xUser.x_user_id,
    //   username: xUser.username,
    //   profile_image_url: xUser.profile_image_url,
    // }).onConflictDoNothing();
    
    return NextResponse.json({
      x_user_id: xUser.x_user_id,
      username: xUser.username,
      profile_image_url: xUser.profile_image_url,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { access_token } = await request.json();
    
    if (!access_token) {
      return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
    }
    
    const xUser = await verifyXToken(access_token);
    
    if (!xUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    
    return NextResponse.json({
      x_user_id: xUser.x_user_id,
      username: xUser.username,
      profile_image_url: xUser.profile_image_url,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

