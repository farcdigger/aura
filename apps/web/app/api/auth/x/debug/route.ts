import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";

/**
 * Debug endpoint to check X OAuth configuration
 * Accessible at /api/auth/x/debug
 */
export async function GET(request: NextRequest) {
  const config = {
    hasClientId: !!env.X_CLIENT_ID,
    hasClientSecret: !!env.X_CLIENT_SECRET,
    hasCallbackUrl: !!env.X_CALLBACK_URL,
    callbackUrl: env.X_CALLBACK_URL || "NOT SET",
    callbackPath: env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL).pathname : "NOT SET",
    callbackHost: env.X_CALLBACK_URL ? new URL(env.X_CALLBACK_URL).hostname : "NOT SET",
    clientIdPrefix: env.X_CLIENT_ID ? env.X_CLIENT_ID.substring(0, 10) + "..." : "NOT SET",
  };

  const issues: string[] = [];
  
  if (!config.hasClientId) {
    issues.push("❌ X_CLIENT_ID is missing");
  }
  if (!config.hasClientSecret) {
    issues.push("❌ X_CLIENT_SECRET is missing");
  }
  if (!config.hasCallbackUrl) {
    issues.push("❌ X_CALLBACK_URL is missing");
  }
  if (config.callbackUrl && !config.callbackUrl.startsWith("https://")) {
    issues.push("⚠️ X_CALLBACK_URL should start with https://");
  }
  if (config.callbackUrl && config.callbackUrl.endsWith("/")) {
    issues.push("⚠️ X_CALLBACK_URL should not end with /");
  }
  if (config.callbackPath !== "/api/auth/x/callback") {
    issues.push(`⚠️ Callback path should be "/api/auth/x/callback" but got "${config.callbackPath}"`);
  }

  const isValid = issues.length === 0;

  return NextResponse.json({
    status: isValid ? "✅ Configured" : "❌ Configuration Issues",
    config,
    issues,
    recommendations: [
      "1. Check X Developer Portal → Settings → User authentication settings",
      "2. Verify Callback URI matches EXACTLY: " + config.callbackUrl,
      "3. Ensure App permissions is set to 'Read'",
      "4. Ensure Type of App is 'Web App, Automated App or Bot'",
      "5. Ensure OAuth 2.0 is enabled",
      "6. After changes, wait 1-2 minutes for X to propagate settings",
    ],
    testUrl: config.hasCallbackUrl && config.hasClientId
      ? `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${env.X_CLIENT_ID}&redirect_uri=${encodeURIComponent(env.X_CALLBACK_URL!)}&scope=users.read%20offline.access&state=test`
      : "Cannot generate test URL - missing configuration",
  });
}

