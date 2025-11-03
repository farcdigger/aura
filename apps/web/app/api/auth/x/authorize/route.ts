import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { createHash } from "crypto";

/**
 * Generate PKCE code verifier and challenge
 * X OAuth 2.0 requires PKCE for security
 * According to: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
 */
function generatePKCE() {
  // Generate random code verifier (43-128 characters)
  // Use crypto.randomBytes for secure random generation
  const crypto = require("crypto");
  const randomBytes = crypto.randomBytes(32);
  
  // Convert to base64url (URL-safe base64 without padding)
  const base64 = randomBytes.toString("base64");
  const verifier = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .substring(0, 128); // Ensure max 128 characters
  
  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { verifier, challenge };
}

export async function GET(request: NextRequest) {
  // Check if X OAuth is configured
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_CALLBACK_URL) {
    return NextResponse.json({ 
      error: "X OAuth not configured",
      details: {
        hasClientId: !!env.X_CLIENT_ID,
        hasClientSecret: !!env.X_CLIENT_SECRET,
        hasCallbackUrl: !!env.X_CALLBACK_URL,
        callbackUrl: env.X_CALLBACK_URL || "NOT SET",
      }
    }, { status: 500 });
  }

  const clientId = env.X_CLIENT_ID.trim();
  const redirectUri = env.X_CALLBACK_URL.trim();
  
  if (!redirectUri.startsWith("https://")) {
    return NextResponse.json({ 
      error: "Callback URL must use https://",
      callbackUrl: redirectUri
    }, { status: 500 });
  }
  
  // Generate PKCE values (required by X OAuth 2.0)
  const { verifier, challenge } = generatePKCE();
  
  // X OAuth 2.0 Authorization Code Flow with PKCE
  // According to X docs: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
  // IMPORTANT: Request all required scopes
  // - users.read: Required for /users/me endpoint
  // - tweet.read: Optional but recommended for bio/description access
  // - offline.access: Optional, for refresh tokens (if needed)
  const scope = "users.read tweet.read offline.access";
  const state = Math.random().toString(36).substring(7);
  
  console.log("🔍 OAuth scope request:", {
    scope,
    scopeArray: scope.split(" "),
    note: "All scopes must be approved by user during authorization",
  });
  
  // Build authorization URL with PKCE (needed in both KV and cookie fallback modes)
  // Ensure redirect_uri is properly encoded
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri, // URLSearchParams will encode it properly
    scope: scope,
    state: state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  
  // Use x.com instead of twitter.com (X's current domain)
  const authUrl = `https://x.com/i/oauth2/authorize?${params.toString()}`;
  
  // Validate OAuth URL format
  try {
    const testUrl = new URL(authUrl);
    if (!testUrl.searchParams.has("client_id") || !testUrl.searchParams.has("redirect_uri")) {
      throw new Error("Invalid OAuth URL parameters");
    }
    console.log("✅ OAuth URL validated:", {
      hasClientId: testUrl.searchParams.has("client_id"),
      hasRedirectUri: testUrl.searchParams.has("redirect_uri"),
      hasCodeChallenge: testUrl.searchParams.has("code_challenge"),
      redirectUriValue: testUrl.searchParams.get("redirect_uri"),
    });
  } catch (urlError) {
    console.error("❌ OAuth URL validation failed:", urlError);
    throw new Error(`Invalid OAuth URL format: ${urlError instanceof Error ? urlError.message : "Unknown error"}`);
  }
  
  // Store code_verifier server-side using KV (keyed by state)
  // This ensures security - verifier never exposed to client
  let verifierStored = false;
  try {
    const kv = await import("@/lib/kv");
    const stateKey = `x_oauth_verifier:${state}`;
    await kv.kv.setex(stateKey, 600, verifier); // Store for 10 minutes
    console.log("✅ PKCE verifier stored in KV for state:", state.substring(0, 5) + "...");
    verifierStored = true;
  } catch (error) {
    console.error("⚠️ Failed to store PKCE verifier in KV:", error);
    console.log("⚠️ KV not available - will use encrypted cookie as fallback");
  }
  
  // Fallback: If KV is not available, use encrypted HTTP-only cookie
  // This works in serverless environments but is less ideal than KV
  if (!verifierStored) {
    // Encrypt verifier with state as additional security
    const crypto = require("crypto");
    const secretKey = env.X_CLIENT_SECRET?.substring(0, 32) || "fallback_secret_key_12345678"; // Use first 32 chars as encryption key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey.padEnd(32, "0")), iv);
    let encrypted = cipher.update(verifier, "utf8", "hex");
    encrypted += cipher.final("hex");
    const encryptedVerifier = iv.toString("hex") + ":" + encrypted;
    
    // Store encrypted verifier in HTTP-only cookie (keyed by state)
    const cookieValue = `${state}:${encryptedVerifier}`;
    console.log("✅ PKCE verifier encrypted and stored in cookie (fallback mode)");
    
    // Return response with Set-Cookie header
    const response = NextResponse.json({ 
      authUrl,
      state,
    });
    
    // Set HTTP-only, secure cookie with 10 minute expiration
    // IMPORTANT: Cookie settings for Vercel deployment
    // - secure: true (required for HTTPS)
    // - sameSite: "lax" (allows OAuth redirects from x.com)
    // - path: "/" (available site-wide)
    // - maxAge: 600 (10 minutes - enough for OAuth flow)
    // - Do NOT set domain (let browser use current domain)
    const cookieName = `x_oauth_verifier_${state}`;
    response.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      secure: true, // Required for HTTPS (Vercel)
      sameSite: "lax", // Allows OAuth redirects from x.com
      maxAge: 600, // 10 minutes
      path: "/",
      // Don't set domain - let browser use current domain (Vercel)
    });
    
    console.log("✅ Cookie set for PKCE fallback:", {
      cookieName,
      cookieValueLength: cookieValue.length,
      stateLength: state.length,
      statePreview: state.substring(0, 5) + "...",
      cookieSettings: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      },
      note: "Cookie will be available for OAuth callback",
    });
    
    return response;
  }
  
  console.log("🔗 X OAuth URL with PKCE:", {
    clientIdLength: clientId.length,
    redirectUri,
    state: state.substring(0, 5) + "...",
    hasCodeChallenge: !!challenge,
  });
  
  return NextResponse.json({ 
    authUrl,
    state, // Return state so frontend can identify the flow
  });
}

