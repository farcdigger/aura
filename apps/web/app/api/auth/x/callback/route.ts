import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, verifyXToken } from "@/lib/x";
import { env } from "@/env.mjs";
import { kv } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  
  // Retrieve PKCE code_verifier from server-side storage (keyed by state)
  let codeVerifier: string | null = null;
  if (state) {
    try {
      // First try KV storage (Supabase)
      const stateKey = `x_oauth_verifier:${state}`;
      console.log("🔍 Attempting to retrieve PKCE verifier from KV:", stateKey.substring(0, 20) + "...");
      
      try {
        const stored = await kv.get(stateKey);
        if (stored) {
          codeVerifier = stored as string;
          // Clean up stored verifier after use
          await kv.del(stateKey);
          console.log("✅ PKCE verifier retrieved from KV");
        } else {
          console.log("ℹ️ PKCE verifier not found in KV, trying cookie fallback...");
        }
      } catch (kvError: any) {
        // KV connection error (e.g., Supabase ENOTFOUND)
        console.warn("⚠️ KV get error (will try cookie fallback):", {
          error: kvError?.message || "Unknown error",
          code: kvError?.code,
          note: "This is OK - cookie fallback will be used"
        });
      }
      
      // Fallback: Try encrypted cookie (used when KV is not available or connection fails)
      if (!codeVerifier) {
        const cookieName = `x_oauth_verifier_${state}`;
        const cookie = request.cookies.get(cookieName);
        const cookieValue = cookie?.value;
        
        // Debug: List all cookies to help troubleshoot
        const allCookies = request.cookies.getAll();
        const verifierCookies = allCookies.filter(c => c.name.startsWith("x_oauth_verifier_"));
        
        console.log("🔍 Checking for PKCE cookie:", {
          cookieName,
          hasCookie: !!cookie,
          cookieValue: cookieValue ? `${cookieValue.substring(0, 20)}...` : null,
          cookieLength: cookieValue?.length || 0,
          allCookiesCount: allCookies.length,
          verifierCookiesFound: verifierCookies.length,
          verifierCookieNames: verifierCookies.map(c => c.name),
          note: cookieValue 
            ? "Cookie found - will decrypt" 
            : "Cookie not found - may be expired, wrong domain/path, or never set",
        });
        
        if (cookieValue) {
          // Parse encrypted verifier from cookie
          // Cookie format: "state:ivHex:encrypted"
          // We need to split carefully since encrypted may contain colons if base64
          const parts = cookieValue.split(":");
          if (parts.length >= 3) {
            const cookieState = parts[0];
            const ivHex = parts[1];
            const encrypted = parts.slice(2).join(":"); // Rejoin in case encrypted has colons
            
            if (cookieState === state && ivHex && encrypted) {
              try {
                // Decrypt verifier
                const crypto = require("crypto");
                const secretKey = env.X_CLIENT_SECRET?.substring(0, 32) || "fallback_secret_key_12345678";
                
                if (ivHex && encrypted) {
                  const iv = Buffer.from(ivHex, "hex");
                  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(secretKey.padEnd(32, "0")), iv);
                  let decrypted = decipher.update(encrypted, "hex", "utf8");
                  decrypted += decipher.final("utf8");
                  codeVerifier = decrypted;
                  
                  console.log("✅ PKCE verifier retrieved from encrypted cookie (fallback mode)");
                  // Cookie will be cleaned up in the final redirect response
                } else {
                  console.error("❌ Invalid encrypted verifier format in cookie - missing ivHex or encrypted");
                }
              } catch (decryptError) {
                console.error("❌ Failed to decrypt PKCE verifier from cookie:", {
                  error: decryptError instanceof Error ? decryptError.message : "Unknown error",
                  ivHexLength: ivHex?.length || 0,
                  encryptedLength: encrypted?.length || 0,
                });
              }
            } else {
              console.warn("⚠️ Cookie state mismatch or missing parts:", {
                cookieState: parts[0],
                expectedState: state,
                partsCount: parts.length,
                hasIvHex: !!parts[1],
                hasEncrypted: parts.length >= 3,
              });
            }
          } else {
            console.error("❌ Invalid cookie format - expected format: state:ivHex:encrypted", {
              cookieLength: cookieValue.length,
              partsCount: parts.length,
              cookiePreview: cookieValue.substring(0, 50) + "...",
            });
          }
        } else {
          console.warn("⚠️ PKCE verifier not found in KV or cookie - token exchange will fail without code_verifier");
        }
      }
    } catch (error) {
      console.error("⚠️ Failed to retrieve PKCE verifier:", error);
    }
  } else {
    console.warn("⚠️ No state parameter - cannot retrieve PKCE verifier");
  }
  
  // Log final status
  console.log("🔍 PKCE Verifier Status:", {
    hasState: !!state,
    hasCodeVerifier: !!codeVerifier,
    codeVerifierLength: codeVerifier?.length || 0,
  });
  
  // Debug logging with detailed URL comparison
  const actualUrl = new URL(request.url);
  const expectedCallbackUrl = env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL) : null;
  
  console.log("🔍 X OAuth Callback Debug:", {
    actualUrl: request.url,
    actualHostname: actualUrl.hostname,
    actualPathname: actualUrl.pathname,
    expectedHostname: expectedCallbackUrl?.hostname,
    expectedPathname: expectedCallbackUrl?.pathname,
    urlMatch: expectedCallbackUrl 
      ? (actualUrl.hostname === expectedCallbackUrl.hostname && actualUrl.pathname === expectedCallbackUrl.pathname)
      : "N/A",
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
    error,
    errorDescription,
    allParams: Object.fromEntries(searchParams.entries()),
    queryString: actualUrl.search,
  });
  
  // Check if X OAuth is configured
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_CALLBACK_URL) {
    console.error("❌ X OAuth not configured:", {
      hasClientId: !!env.X_CLIENT_ID,
      hasClientSecret: !!env.X_CLIENT_SECRET,
      hasCallbackUrl: !!env.X_CALLBACK_URL,
    });
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("X OAuth not configured")}`, request.url));
  }
  
  // Check for X OAuth errors first
  if (error) {
    console.error("❌ X OAuth error received:", {
      error,
      errorDescription,
      note: "User may have denied access or there's a configuration issue",
    });
    
    // Provide more specific error messages
    let errorMessage = error;
    if (errorDescription) {
      errorMessage = `${error}: ${errorDescription}`;
    } else if (error === "access_denied") {
      errorMessage = "X bağlantısı reddedildi. Lütfen tekrar deneyin.";
    } else if (error === "invalid_request") {
      errorMessage = "Geçersiz istek. Callback URI'yi kontrol edin.";
    }
    
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorMessage)}`, request.url));
  }
  
  // Check if authorization code is missing
  if (!code) {
    const receivedParams = Object.fromEntries(searchParams.entries());
    const isDirectAccess = Object.keys(receivedParams).length === 0;
    
    console.error("❌ Missing authorization code:", {
      receivedParams,
      isDirectAccess,
      expectedUrl: env.X_CALLBACK_URL,
      actualUrl: request.url,
      urlHostname: new URL(request.url).hostname,
      callbackHostname: env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL).hostname : "N/A",
      note: isDirectAccess 
        ? "Direct access to callback URL (user didn't come from OAuth flow)"
        : "OAuth flow returned but no code parameter (check error parameter)",
    });
    
    // Check if this is a direct callback URL access (without OAuth redirect)
    let errorMsg = "Authorization code gelmedi.";
    
    if (isDirectAccess) {
      errorMsg = "Bu sayfaya doğrudan erişilemez. Lütfen 'Connect X Account' butonunu kullan.";
    } else if (searchParams.has("error")) {
      errorMsg = `X hatası: ${error || "Bilinmeyen hata"}`;
      if (errorDescription) {
        errorMsg += ` - ${errorDescription}`;
      }
    } else {
      errorMsg = "Authorization code gelmedi. Callback URI eşleşmiyor olabilir. X Developer Portal ayarlarını kontrol edin.";
    }
    
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorMsg)}`, request.url));
  }
  
  try {
    console.log("✅ Authorization code received, exchanging for token...");
    console.log("🔍 Debug info:", {
      hasCode: !!code,
      codeLength: code?.length || 0,
      hasState: !!state,
      hasCodeVerifier: !!codeVerifier,
      hasClientId: !!env.X_CLIENT_ID,
      hasClientSecret: !!env.X_CLIENT_SECRET,
      callbackUrl: env.X_CALLBACK_URL,
      actualUrl: request.url,
    });
    
    // Check if X OAuth credentials are configured
    if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_CALLBACK_URL) {
      console.error("❌ X OAuth not configured:", {
        hasClientId: !!env.X_CLIENT_ID,
        hasClientSecret: !!env.X_CLIENT_SECRET,
        hasCallbackUrl: !!env.X_CALLBACK_URL,
      });
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("X OAuth not configured. Vercel environment variables'ı kontrol edin.")}`, request.url));
    }
    
    // CRITICAL: X OAuth 2.0 REQUIRES code_verifier for PKCE
    // Without it, token exchange will fail with 400 error
    if (!codeVerifier) {
      console.error("❌ CRITICAL: PKCE code_verifier is missing!");
      console.error("💡 This will cause token exchange to fail");
      console.error("💡 Possible causes:");
      console.error("   1. DATABASE_URL not set in Vercel (Supabase KV connection failed)");
      console.error("   2. Cookie fallback failed (X_CLIENT_SECRET wrong for decryption)");
      console.error("   3. State parameter mismatch");
      console.error("💡 Solutions:");
      console.error("   1. Add DATABASE_URL to Vercel environment variables");
      console.error("   2. Ensure X_CLIENT_SECRET matches the one used during authorization");
      console.error("   3. Try reconnecting (generates new state and verifier)");
      
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("PKCE verifier bulunamadı. DATABASE_URL Vercel'de ayarlı mı kontrol edin veya tekrar bağlanmayı deneyin.")}`, request.url));
    }
    
    // Use exact values from env (trim whitespace)
    // Pass code_verifier for PKCE (X OAuth 2.0 requires it)
    console.log("🔄 Calling exchangeCodeForToken:", {
      hasCode: !!code,
      codeLength: code.length,
      hasCodeVerifier: !!codeVerifier,
      codeVerifierLength: codeVerifier.length,
      clientIdLength: env.X_CLIENT_ID.length,
      clientSecretLength: env.X_CLIENT_SECRET.length,
      callbackUrl: env.X_CALLBACK_URL,
    });
    
    const tokenResponse = await exchangeCodeForToken(
      code,
      env.X_CLIENT_ID,
      env.X_CLIENT_SECRET,
      env.X_CALLBACK_URL,
      codeVerifier // PKCE code_verifier (required, already validated above)
    );
    
    if (!tokenResponse) {
      console.error("❌ Failed to exchange token - exchangeCodeForToken returned null");
      console.error("💡 This usually means:");
      console.error("   - X_CLIENT_ID or X_CLIENT_SECRET is wrong");
      console.error("   - X_CALLBACK_URL doesn't match X Developer Portal");
      console.error("   - code_verifier is wrong (PKCE mismatch)");
      console.error("   - Authorization code expired or invalid");
      console.error("💡 Check Vercel logs above for X API error details");
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("Failed to exchange token. Vercel logs'u kontrol edin veya X Developer Portal ayarlarını kontrol edin.")}`, request.url));
    }
    
    console.log("✅ Token received, verifying user...");
    console.log("🔍 Token details:", {
      tokenType: tokenResponse.token_type,
      accessTokenLength: tokenResponse.access_token?.length || 0,
      accessTokenPreview: tokenResponse.access_token?.substring(0, 20) + "...",
    });
    
    const xUser = await verifyXToken(tokenResponse.access_token);
    
    if (!xUser) {
      console.error("❌ Failed to verify user - verifyXToken returned null");
      console.error("💡 This usually means:");
      console.error("   - X Developer Portal → User authentication settings → App permissions must be 'Read' or 'Read and Write'");
      console.error("   - The OAuth app may need to be reviewed/approved by X");
      console.error("   - The access token doesn't have the required scopes");
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("X hesabınız doğrulanamadı. X Developer Portal ayarlarını kontrol edin - App permissions 'Read' olmalı.")}`, request.url));
    }
    
    console.log("✅ User verified:", { username: xUser.username, x_user_id: xUser.x_user_id });
    
    // Redirect back to main page with user data in query params (or use session/cookies)
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("x_user_id", xUser.x_user_id);
    redirectUrl.searchParams.set("username", xUser.username);
    redirectUrl.searchParams.set("profile_image_url", xUser.profile_image_url);
    if (xUser.bio) {
      redirectUrl.searchParams.set("bio", xUser.bio);
    }
    
    const response = NextResponse.redirect(redirectUrl);
    
    // Set session cookie to persist user authentication across page refreshes
    // This cookie stores encrypted user data so user doesn't need to reconnect
    const crypto = require("crypto");
    const secretKey = env.X_CLIENT_SECRET?.substring(0, 32) || "fallback_secret_key_12345678";
    const iv = crypto.randomBytes(16);
    const sessionData = JSON.stringify({
      x_user_id: xUser.x_user_id,
      username: xUser.username,
      profile_image_url: xUser.profile_image_url,
      bio: xUser.bio,
      timestamp: Date.now(),
    });
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey.padEnd(32, "0")), iv);
    let encrypted = cipher.update(sessionData, "utf8", "hex");
    encrypted += cipher.final("hex");
    const encryptedSession = iv.toString("hex") + ":" + encrypted;
    
    // Set session cookie (lasts 7 days)
    response.cookies.set("x_user_session", encryptedSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    
    console.log("✅ Session cookie set for user:", {
      username: xUser.username,
      x_user_id: xUser.x_user_id,
      expiresIn: "7 days",
    });
    
    // Clean up PKCE verifier cookie if it was used (fallback mode)
    if (state) {
      const cookieName = `x_oauth_verifier_${state}`;
      response.cookies.delete(cookieName);
    }
    
    return response;
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent("Authentication failed")}`, request.url));
  }
}

