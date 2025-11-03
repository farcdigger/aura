import axios from "axios";
import type { XUser } from "@/lib/types";

// Use api.x.com instead of api.twitter.com (recommended by X for OAuth 2.0)
const X_API_BASE = "https://api.x.com/2";

export async function verifyXToken(accessToken: string): Promise<XUser | null> {
  try {
    const response = await axios.get(`${X_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AuraCreatures/1.0",
      },
      params: {
        "user.fields": "profile_image_url,description",
      },
    });
    
    const user = response.data.data;
    return {
      x_user_id: user.id,
      username: user.username,
      profile_image_url: user.profile_image_url || "",
      bio: user.description || "",
    };
  } catch (error: any) {
    const errorDetails = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      url: `${X_API_BASE}/users/me`,
    };
    
    console.error("❌ X API error:", JSON.stringify(errorDetails, null, 2));
    
    // Provide specific guidance for 403 errors
    if (error.response?.status === 403) {
      console.error("💡 403 Forbidden - Detailed diagnosis:");
      console.error("   1. SCOPE CHECK: Token must include 'users.read' scope");
      console.error("      → Check token exchange response log above for 'scope' field");
      console.error("      → If scope missing: Authorize URL must include 'scope=users.read'");
      console.error("   2. API HOST: Using api.x.com (not api.twitter.com)");
      console.error("   3. X Developer Portal → User authentication settings:");
      console.error("      → App permissions: 'Read' or 'Read and Write'");
      console.error("      → Type of App: 'Web App'");
      console.error("      → Callback URI: Must match exactly");
      console.error("   4. PLAN LIMITATION: Free plan may restrict /users/me endpoint");
      console.error("      → Consider upgrading to Basic plan if scope is correct");
      console.error("   5. APP REVIEW: App may need X approval/review");
      console.error("💡 Quick test: Check token exchange log for 'scope' value above");
      if (error.response?.data) {
        console.error("💡 X API Error Response:", JSON.stringify(error.response.data, null, 2));
      }
    }
    
    return null;
  }
}

export async function getXUserProfile(accessToken: string, userId: string): Promise<XUser | null> {
  try {
    const response = await axios.get(`${X_API_BASE}/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AuraCreatures/1.0",
      },
      params: {
        "user.fields": "profile_image_url,description",
      },
    });
    
    const user = response.data.data;
    return {
      x_user_id: user.id,
      username: user.username,
      profile_image_url: user.profile_image_url || "",
      bio: user.description || "",
    };
  } catch (error) {
    console.error("X API error:", error);
    return null;
  }
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier?: string // PKCE code_verifier
): Promise<{ access_token: string; token_type: string } | null> {
  // Trim whitespace (declare outside try block for catch block access)
  const cleanClientId = clientId?.trim() || "";
  const cleanClientSecret = clientSecret?.trim() || "";
  const cleanRedirectUri = redirectUri?.trim() || "";
  
  try {
    const auth = Buffer.from(`${cleanClientId}:${cleanClientSecret}`).toString("base64");
    
    console.log("🔄 Exchanging code for token:", {
      codeLength: code.length,
      redirectUri: cleanRedirectUri,
      hasCodeVerifier: !!codeVerifier,
    });
    
    // Build token request parameters
    const tokenParams: Record<string, string> = {
      code,
      grant_type: "authorization_code",
      client_id: cleanClientId,
      redirect_uri: cleanRedirectUri,
    };
    
    // Add code_verifier if PKCE is used (X OAuth 2.0 requires it)
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier;
    }
    
    // Use api.x.com for token exchange (recommended by X for OAuth 2.0)
    const response = await axios.post(
      "https://api.x.com/2/oauth2/token",
      new URLSearchParams(tokenParams),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    
    console.log("✅ Token exchange successful");
    
    // Log token response (without sensitive data) - CRITICAL for debugging 403 errors
    const tokenData = response.data;
    console.log("🔍 Token response:", {
      tokenType: tokenData.token_type,
      hasAccessToken: !!tokenData.access_token,
      accessTokenLength: tokenData.access_token?.length || 0,
      hasScope: !!tokenData.scope,
      scope: tokenData.scope || "NOT PROVIDED - THIS IS THE PROBLEM!",
      scopeArray: tokenData.scope ? tokenData.scope.split(" ") : [],
      expiresIn: tokenData.expires_in || "Not provided",
    });
    
    // CRITICAL CHECK: Verify users.read scope is present
    if (!tokenData.scope || !tokenData.scope.includes("users.read")) {
      console.error("⚠️ WARNING: Token does not include 'users.read' scope!");
      console.error("💡 This will cause 403 Forbidden on /users/me endpoint");
      console.error("💡 Fix: Check authorize URL scope parameter - must include 'users.read'");
    } else {
      console.log("✅ Token includes 'users.read' scope - should work with /users/me");
    }
    
    return response.data;
  } catch (error: any) {
    const errorDetails = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      clientIdLength: cleanClientId?.length || 0,
      clientSecretLength: cleanClientSecret?.length || 0,
      redirectUri: cleanRedirectUri,
      hasCodeVerifier: !!codeVerifier,
      note: "Check if Client ID, Secret, and Callback URI match X Developer Portal",
    };
    
    console.error("❌ X OAuth token exchange error:", JSON.stringify(errorDetails, null, 2));
    
    // Provide more detailed error information
    if (error.response?.status === 400) {
      console.error("💡 Common causes: Invalid code, expired code, redirect_uri mismatch, or missing code_verifier (PKCE)");
      if (error.response?.data) {
        console.error("💡 X API Error Details:", JSON.stringify(error.response.data, null, 2));
      }
    } else if (error.response?.status === 401) {
      console.error("💡 Common causes: Invalid Client ID or Secret");
      console.error("💡 Check: X Developer Portal → Settings → Keys and Tokens → OAuth 2.0 credentials");
    } else if (error.response?.status === 403) {
      console.error("💡 Common causes: Client ID/Secret mismatch or app not approved");
    }
    
    return null;
  }
}

