import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import type { XUser } from "@/lib/types";

/**
 * Get current X user session from cookie
 * This allows the frontend to check if user is still authenticated
 * after page refresh
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("x_user_session");
    
    if (!sessionCookie?.value) {
      return NextResponse.json({ 
        authenticated: false,
        user: null 
      });
    }
    
    try {
      // Decrypt session data
      const crypto = require("crypto");
      const secretKey = env.X_CLIENT_SECRET?.substring(0, 32) || "fallback_secret_key_12345678";
      const [ivHex, encrypted] = sessionCookie.value.split(":");
      
      if (!ivHex || !encrypted) {
        return NextResponse.json({ 
          authenticated: false,
          user: null 
        });
      }
      
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(secretKey.padEnd(32, "0")), iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      
      const sessionData = JSON.parse(decrypted);
      
      // Check if session is expired (older than 7 days)
      const sessionAge = Date.now() - (sessionData.timestamp || 0);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      if (sessionAge > maxAge) {
        // Session expired
        return NextResponse.json({ 
          authenticated: false,
          user: null 
        });
      }
      
      const user: XUser = {
        x_user_id: sessionData.x_user_id,
        username: sessionData.username,
        profile_image_url: sessionData.profile_image_url || "",
        bio: sessionData.bio,
      };
      
      return NextResponse.json({
        authenticated: true,
        user,
      });
    } catch (decryptError) {
      console.error("Failed to decrypt session cookie:", decryptError);
      return NextResponse.json({ 
        authenticated: false,
        user: null 
      });
    }
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ 
      authenticated: false,
      user: null 
    }, { status: 500 });
  }
}

/**
 * Clear X user session (logout)
 */
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("x_user_session");
  return response;
}

