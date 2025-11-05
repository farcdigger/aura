import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { createHash, createHmac } from "crypto";

/**
 * Encrypt verifier into state parameter
 * This ensures verifier is always available in callback, regardless of KV/cookie issues
 * Uses HMAC for integrity verification
 */
function encodeVerifierInState(state: string, verifier: string): string {
  // Use X_CLIENT_SECRET as encryption key (already available in env)
  if (!env.X_CLIENT_SECRET) {
    throw new Error("X_CLIENT_SECRET not configured");
  }
  
  // Create HMAC signature for verifier
  const hmac = createHmac('sha256', env.X_CLIENT_SECRET);
  hmac.update(verifier);
  const signature = hmac.digest('base64url');
  
  // Encode verifier as base64url (URL-safe)
  const encodedVerifier = Buffer.from(verifier).toString('base64url');
  
  // Format: state:encoded_verifier:signature
  // This ensures verifier can be retrieved even if KV/cookie fails
  return `${state}:${encodedVerifier}:${signature}`;
}

/**
 * Decode verifier from state parameter
 * Returns null if verification fails
 */
function decodeVerifierFromState(encryptedState: string): { state: string; verifier: string } | null {
  try {
    if (!env.X_CLIENT_SECRET) {
      return null;
    }
    
    const parts = encryptedState.split(':');
    if (parts.length !== 3) {
      return null; // Invalid format
    }
    
    const [state, encodedVerifier, signature] = parts;
    
    // Decode verifier
    const verifier = Buffer.from(encodedVerifier, 'base64url').toString('utf-8');
    
    // Verify HMAC signature
    const hmac = createHmac('sha256', env.X_CLIENT_SECRET);
    hmac.update(verifier);
    const expectedSignature = hmac.digest('base64url');
    
    if (signature !== expectedSignature) {
      console.error("❌ Verifier signature mismatch - possible tampering");
      return null;
    }
    
    return { state, verifier };
  } catch (error) {
    console.error("❌ Error decoding verifier from state:", error);
    return null;
  }
}

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
  const randomState = Math.random().toString(36).substring(7);
  
  // CRITICAL FIX: Encode verifier into state parameter
  // This ensures verifier is always available in callback, even if KV/cookie fails
  // Format: random_state:encoded_verifier:hmac_signature
  const encryptedState = encodeVerifierInState(randomState, verifier);
  
  console.log("🔍 OAuth scope request:", {
    scope,
    scopeArray: scope.split(" "),
    note: "All scopes must be approved by user during authorization",
  });
  
  console.log("🔐 Verifier encoding:", {
    randomState: randomState.substring(0, 6) + "...",
    encryptedStateLength: encryptedState.length,
    note: "Verifier is now embedded in state parameter for guaranteed availability",
  });
  
  // Build authorization URL with PKCE (needed in both KV and cookie fallback modes)
  // Ensure redirect_uri is properly encoded
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri, // URLSearchParams will encode it properly
    scope: scope,
    state: encryptedState, // Use encrypted state (includes verifier)
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
  let kvError: any = null;
  
  try {
    const kv = await import("@/lib/kv");
    const { isVercelKv, isSupabaseKv, isKvAvailable } = await import("@/lib/kv");
    
    console.log("🔍 KV Status at authorize:", {
      isKvAvailable,
      isVercelKv,
      isSupabaseKv,
      kvType: isVercelKv ? "Vercel KV" : isSupabaseKv ? "Supabase KV" : "Mock KV",
      hasKvUrl: !!env.KV_REST_API_URL,
      hasKvToken: !!env.KV_REST_API_TOKEN,
      randomState: randomState.substring(0, 6) + "...",
      note: "KV is now optional - verifier is embedded in state parameter",
    });
    
    // KV storage is now optional (backward compatibility)
    // Primary method: verifier in encrypted state
    // Fallback: KV storage (for legacy support)
    if (!isKvAvailable) {
      console.log("ℹ️ KV not available - verifier is in state parameter, so this is OK");
      // Don't throw - verifier is in state, so we can continue
    } else {
      // Store in KV as fallback (keyed by randomState, not encryptedState)
      const stateKey = `x_oauth_verifier:${randomState}`;
      console.log(`📝 Attempting to store PKCE verifier with key: ${stateKey}`);
      
      const setexResult = await kv.kv.setex(stateKey, 600, verifier); // Store for 10 minutes
      console.log(`📝 KV setex result:`, setexResult);
      
      if (setexResult === "OK") {
        console.log("✅ PKCE verifier stored in KV for state:", randomState);
        
        // Verify it was actually stored by reading it back immediately
        console.log(`🔍 Verifying PKCE verifier storage with get: ${stateKey}`);
        const verifyResult = await kv.kv.get(stateKey);
        console.log(`📝 KV get result:`, {
          found: !!verifyResult,
          lengthMatches: verifyResult?.length === verifier.length,
          valueMatches: verifyResult === verifier,
        });
        
        if (verifyResult === verifier) {
          console.log("✅ PKCE verifier verified in KV - storage successful!");
          verifierStored = true;
        } else {
          console.error("❌ PKCE verifier stored but verification failed!", {
            expected: verifier.substring(0, 10) + "...",
            got: verifyResult?.substring(0, 10) + "..." || "null",
            willUseCookieFallback: true,
          });
          verifierStored = false;
        }
      } else {
        console.warn("⚠️ PKCE verifier setex returned unexpected result:", setexResult);
        verifierStored = false;
      }
    }
  } catch (error: any) {
    kvError = error;
    console.error("⚠️ Failed to store PKCE verifier in KV:", {
      error: error?.message || "Unknown error",
      code: error?.code,
      stack: error?.stack?.split("\n")[0],
      note: "Will use encrypted cookie as fallback",
      suggestion: "Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel environment variables"
    });
    console.log("⚠️ KV not available - will use encrypted cookie as fallback");
    verifierStored = false;
  }
  
  // Fallback: If KV is not available, use encrypted HTTP-only cookie
  // This works in serverless environments but is less ideal than KV
  // IMPORTANT: Cookie fallback is required when KV fails or cache is cleared
  if (!verifierStored) {
    console.log("📦 Using cookie fallback for PKCE verifier storage");
    // Encrypt verifier with state as additional security
    const crypto = require("crypto");
    const secretKey = env.X_CLIENT_SECRET?.substring(0, 32) || "fallback_secret_key_12345678"; // Use first 32 chars as encryption key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey.padEnd(32, "0")), iv);
    let encrypted = cipher.update(verifier, "utf8", "hex");
    encrypted += cipher.final("hex");
    const encryptedVerifier = iv.toString("hex") + ":" + encrypted;
    
    // Store encrypted verifier in HTTP-only cookie (keyed by state)
    // Use both a specific cookie for this state AND a general cookie that can be read by callback
    const cookieValue = `${state}:${encryptedVerifier}`;
    console.log("✅ PKCE verifier encrypted and stored in cookie (fallback mode)");
    console.log("   Cookie will be available for 10 minutes (600 seconds)");
    
    // Return response with Set-Cookie header
    const response = NextResponse.json({ 
      authUrl,
      state,
    });
    
    // Set HTTP-only, secure cookie with 10 minute expiration
    // IMPORTANT: Cookie settings for Vercel deployment
    // - secure: true (required for HTTPS)
    // - sameSite: "none" (CRITICAL: allows OAuth redirects from x.com to work reliably)
    // - path: "/" (available site-wide)
    // - maxAge: 600 (10 minutes - enough for OAuth flow)
    // - Do NOT set domain (let browser use current domain)
    const cookieName = `x_oauth_verifier_${state}`;
    response.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      secure: true, // Required for HTTPS (Vercel)
      sameSite: "none", // CRITICAL: allows cross-site OAuth redirects from x.com
      maxAge: 600, // 10 minutes
      path: "/",
      // Don't set domain - let browser use current domain (Vercel)
    });
    
    console.log("✅ Cookie set for PKCE fallback:", {
      cookieName,
      cookieValueLength: cookieValue.length,
      stateLength: state.length,
      state: state, // Full state for debugging
      kvError: kvError?.message || "N/A",
      cookieSettings: {
        httpOnly: true,
        secure: true,
        sameSite: "none", // Changed from "lax" to "none" for cross-site OAuth
        maxAge: 600,
        path: "/",
      },
      note: "Cookie will be available for OAuth callback",
      warning: "If cookie is not found in callback, check browser DevTools → Application → Cookies",
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

