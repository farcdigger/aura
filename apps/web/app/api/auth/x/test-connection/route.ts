import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";

/**
 * Test endpoint to verify X OAuth configuration
 * Returns detailed information about configuration without exposing secrets
 */
export async function GET(request: NextRequest) {
  const checks = {
    clientId: {
      exists: !!env.X_CLIENT_ID,
      length: env.X_CLIENT_ID?.length || 0,
      startsWith: env.X_CLIENT_ID?.substring(0, 3) || "N/A",
      format: env.X_CLIENT_ID?.match(/^[A-Za-z0-9_-]+$/) ? "✅ Valid format" : "❌ Invalid format",
    },
    clientSecret: {
      exists: !!env.X_CLIENT_SECRET,
      length: env.X_CLIENT_SECRET?.length || 0,
      startsWith: env.X_CLIENT_SECRET?.substring(0, 3) || "N/A",
    },
    callbackUrl: {
      exists: !!env.X_CALLBACK_URL,
      value: env.X_CALLBACK_URL || "NOT SET",
      protocol: env.X_CALLBACK_URL?.startsWith("https://") ? "✅ https://" : env.X_CALLBACK_URL?.startsWith("http://") ? "⚠️ http:// (should be https://)" : "❌ Invalid",
      hasTrailingSlash: env.X_CALLBACK_URL?.endsWith("/") ? "❌ Has trailing slash" : "✅ No trailing slash",
      path: env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL).pathname : "N/A",
      hostname: env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL).hostname : "N/A",
    },
  };

  const issues: string[] = [];
  
  if (!checks.clientId.exists) {
    issues.push("❌ X_CLIENT_ID is missing");
  } else if (checks.clientId.length < 10) {
    issues.push("⚠️ X_CLIENT_ID seems too short");
  }
  
  if (!checks.clientSecret.exists) {
    issues.push("❌ X_CLIENT_SECRET is missing");
  } else if (checks.clientSecret.length < 10) {
    issues.push("⚠️ X_CLIENT_SECRET seems too short");
  }
  
  if (!checks.callbackUrl.exists) {
    issues.push("❌ X_CALLBACK_URL is missing");
  } else {
    if (!checks.callbackUrl.value.startsWith("https://")) {
      issues.push("⚠️ X_CALLBACK_URL should use https:// protocol");
    }
    if (checks.callbackUrl.value.endsWith("/")) {
      issues.push("⚠️ X_CALLBACK_URL should not end with /");
    }
    if (checks.callbackUrl.path !== "/api/auth/x/callback") {
      issues.push(`⚠️ Callback path should be "/api/auth/x/callback" but is "${checks.callbackUrl.path}"`);
    }
  }

  // Generate test authorization URL with detailed breakdown
  let testAuthorizationUrl = "Cannot generate - missing configuration";
  let urlComponents: any = null;
  
  if (checks.clientId.exists && checks.callbackUrl.exists) {
    // Normalize callback URL
    let normalizedCallback = env.X_CALLBACK_URL!;
    if (normalizedCallback.endsWith("/") && normalizedCallback !== "https://" && normalizedCallback !== "http://") {
      normalizedCallback = normalizedCallback.slice(0, -1);
    }
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.X_CLIENT_ID!,
      redirect_uri: normalizedCallback,
      scope: "users.read",
      state: "test_check",
    });
    
    testAuthorizationUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
    
    urlComponents = {
      endpoint: "https://twitter.com/i/oauth2/authorize",
      clientId: env.X_CLIENT_ID!,
      clientIdLength: env.X_CLIENT_ID!.length,
      redirectUri: normalizedCallback,
      redirectUriEncoded: encodeURIComponent(normalizedCallback),
      scope: "users.read",
      fullUrl: testAuthorizationUrl.substring(0, 200) + "...",
    };
  }

  return NextResponse.json({
    status: issues.length === 0 ? "✅ Configuration looks good" : "⚠️ Configuration issues found",
    checks,
    issues,
    criticalChecks: {
      clientIdValid: checks.clientId.exists && checks.clientId.length > 20,
      callbackUrlValid: checks.callbackUrl.exists && 
                        checks.callbackUrl.value.startsWith("https://") && 
                        !checks.callbackUrl.value.endsWith("/") &&
                        checks.callbackUrl.path === "/api/auth/x/callback",
    },
    urlComponents,
    testAuthorizationUrl,
    recommendations: [
      "1. X Developer Portal → Keys and tokens → OAuth 2.0 Client ID → TAM kopyala (genellikle 40+ karakter)",
      "2. Vercel → Environment Variables → X_CLIENT_ID → Yapıştır (boşluk, yeni satır olmamalı)",
      "3. X Developer Portal → Settings → User authentication settings → Callback URI kontrol:",
      "   MUST BE EXACTLY: https://aura-creatures.vercel.app/api/auth/x/callback",
      "   - https:// (http değil)",
      "   - Sonunda / olmamalı",
      "   - Büyük/küçük harf duyarlı",
      "4. App permissions: Read (Read and write değil)",
      "5. Type of App: Web App, Automated App or Bot (Native App değil)",
      "6. OAuth 2.0 Settings → Enabled olmalı",
      "7. App durumu: Active olmalı (suspended/pending değil)",
      "8. Değişikliklerden sonra: Save → 2-3 dakika bekle → Redeploy",
    ],
    troubleshooting: {
      step1: "Browser console'u aç (F12) ve 'Connect X Account' butonuna tıkla",
      step2: "Authorization URL'deki client_id parametresini kontrol et",
      step3: "X Developer Portal → Keys and tokens → Client ID ile karşılaştır",
      step4: "Eğer eşleşmiyorsa → Vercel environment variable'ı güncelle",
      step5: "X Portal → Analytics → User authentication → Error logs'u kontrol et",
    },
  });
}

