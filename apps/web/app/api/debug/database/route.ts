import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";

/**
 * Debug endpoint to check DATABASE_URL configuration
 * Accessible at /api/debug/database
 * Shows connection string format (without password) for debugging
 */
export async function GET(request: NextRequest) {
  const hasDatabaseUrl = !!env.DATABASE_URL;
  
  // Parse DATABASE_URL to show format (hide password)
  let dbInfo: any = {
    exists: hasDatabaseUrl,
    url: "NOT SET",
    protocol: "N/A",
    hostname: "N/A",
    port: "N/A",
    database: "N/A",
    username: "N/A",
  };

  if (hasDatabaseUrl && env.DATABASE_URL) {
    try {
      const dbUrl = new URL(env.DATABASE_URL);
      dbInfo = {
        exists: true,
        url: env.DATABASE_URL.replace(/:[^:@]+@/, ":****@"), // Hide password
        protocol: dbUrl.protocol,
        hostname: dbUrl.hostname,
        port: dbUrl.port,
        database: dbUrl.pathname.replace("/", ""),
        username: dbUrl.username,
        // Check if it's IPv4 format
        hasIPv4Prefix: dbUrl.hostname?.startsWith("ipv4:"),
        // Check if it's pooling format
        isPooling: dbUrl.hostname?.includes("pooler.supabase.com"),
        isDirect: dbUrl.hostname?.includes("db.") && dbUrl.hostname?.includes(".supabase.co"),
      };
    } catch (error) {
      dbInfo.parseError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!hasDatabaseUrl) {
    issues.push("❌ DATABASE_URL is not set");
    recommendations.push("1. Go to Vercel Dashboard → Settings → Environment Variables");
    recommendations.push("2. Add DATABASE_URL with Supabase connection string");
  } else {
    if (dbInfo.protocol !== "postgresql:" && dbInfo.protocol !== "postgres:") {
      issues.push(`⚠️ Invalid protocol: ${dbInfo.protocol} (should be postgresql: or postgres:)`);
    }

    if (dbInfo.hostname === "N/A" || !dbInfo.hostname) {
      issues.push("❌ Could not parse hostname from DATABASE_URL");
      recommendations.push("Check DATABASE_URL format in Vercel");
    } else {
      // Check hostname format
      if (!dbInfo.hasIPv4Prefix && !dbInfo.isPooling && !dbInfo.isDirect) {
        issues.push("⚠️ Hostname format may be incorrect");
        recommendations.push("Try adding ipv4: prefix: postgresql://postgres:[PASSWORD]@ipv4:db.vzhclqjrqhhpyicaktpv.supabase.co:5432/postgres");
      }

      if (dbInfo.isDirect && !dbInfo.hasIPv4Prefix) {
        recommendations.push("For direct connection, try adding ipv4: prefix to fix DNS issues");
      }

      if (dbInfo.isPooling) {
        recommendations.push("If pooling fails, try direct connection format");
      }
    }

    if (dbInfo.port !== "5432" && dbInfo.port !== "6543") {
      issues.push(`⚠️ Unexpected port: ${dbInfo.port} (should be 5432 for direct or 6543 for pooling)`);
    }
  }

  // Connection string format suggestions
  const formatSuggestions = {
    direct: "postgresql://postgres:[PASSWORD]@ipv4:db.vzhclqjrqhhpyicaktpv.supabase.co:5432/postgres",
    pooling: "postgresql://postgres.vzhclqjrqhhpyicaktpv:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  };

  return NextResponse.json({
    status: issues.length === 0 ? "✅ DATABASE_URL configured" : "❌ DATABASE_URL issues found",
    databaseInfo: dbInfo,
    issues,
    recommendations,
    formatSuggestions,
    note: "Password is hidden in URL for security. Check Vercel environment variables to verify actual value.",
  });
}

