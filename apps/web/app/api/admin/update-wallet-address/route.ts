/**
 * Admin endpoint: Update wallet_address in tokens table
 * Usage: /api/admin/update-wallet-address?wallet=0x...
 */

import { NextRequest, NextResponse } from "next/server";
import { db, tokens, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { env } from "@/env.mjs";
import { ethers } from "ethers";

// Next.js 14 için dynamic route olarak işaretle
export const dynamic = 'force-dynamic';

// ✅ Güvenlik: Admin API key kontrolü
function requireAdminAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("x-admin-api-key");
  
  if (!env.ADMIN_API_KEY) {
    return NextResponse.json(
      { error: "Admin API key not configured" },
      { status: 500 }
    );
  }
  
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    return NextResponse.json(
      { error: "Unauthorized. Admin API key required in header: x-admin-api-key" },
      { status: 401 }
    );
  }
  
  return null; // Authorized
}

// ✅ XSS koruması: HTML escape function
function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export async function GET(request: NextRequest) {
  // ✅ Güvenlik: Admin API key kontrolü
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("wallet");
    
    // ✅ Güvenlik: Wallet address validation
    if (walletAddress && !ethers.isAddress(walletAddress)) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Update Wallet Address</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #e53e3e; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="error">❌ Invalid Wallet Address</h1>
              <p>Invalid wallet address format: ${escapeHtml(walletAddress)}</p>
            </div>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    console.log("🔧 [UPDATE-WALLET] Request received:", { wallet: walletAddress?.substring(0, 10) + "..." });

    if (!walletAddress) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Update Wallet Address</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #e53e3e; }
              .code { background: #f7fafc; padding: 10px; border-radius: 4px; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="error">❌ Error: Missing wallet parameter</h1>
              <p>Usage:</p>
              <div class="code">
                /api/admin/update-wallet-address?wallet=0x...
              </div>
            </div>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();
    console.log("🔍 [UPDATE-WALLET] Normalized address:", normalizedAddress);

    // Step 1: Find user with this wallet address
    console.log("🔍 [UPDATE-WALLET] Step 1: Looking up user...");
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.wallet_address, normalizedAddress))
      .limit(1);

    if (!userResult || userResult.length === 0) {
      console.error("❌ [UPDATE-WALLET] User not found with wallet:", normalizedAddress);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Update Wallet Address</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #e53e3e; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="error">❌ User Not Found</h1>
              <p>No user found with wallet address: <strong>${escapeHtml(walletAddress)}</strong></p>
              <p>Make sure this wallet is registered in the users table.</p>
            </div>
          </body>
        </html>
        `,
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    const user = userResult[0];
    const xUserId = user.x_user_id;
    console.log("✅ [UPDATE-WALLET] User found:", { x_user_id: xUserId, username: user.username });

    // Step 2: Find token(s) for this x_user_id
    console.log("🔍 [UPDATE-WALLET] Step 2: Looking up tokens...");
    const tokenResult = await db
      .select()
      .from(tokens)
      .where(eq(tokens.x_user_id, xUserId))
      .limit(10); // Get up to 10 tokens

    if (!tokenResult || tokenResult.length === 0) {
      console.error("❌ [UPDATE-WALLET] No tokens found for x_user_id:", xUserId);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Update Wallet Address</title>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .warning { color: #d69e2e; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="warning">⚠️ No Tokens Found</h1>
              <p>User found but no NFT tokens in database.</p>
              <p><strong>Username:</strong> ${escapeHtml(user.username)}</p>
              <p><strong>X User ID:</strong> ${escapeHtml(String(xUserId))}</p>
              <p>Please generate an NFT first.</p>
            </div>
          </body>
        </html>
        `,
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    console.log(`✅ [UPDATE-WALLET] Found ${tokenResult.length} token(s)`);

    // Step 3: Update wallet_address for all tokens
    console.log("💾 [UPDATE-WALLET] Step 3: Updating tokens...");
    let updatedCount = 0;
    const updates = [];

    for (const token of tokenResult) {
      try {
        await db
          .update(tokens)
          .set({ wallet_address: normalizedAddress })
          .where(eq(tokens.id, token.id));
        
        updatedCount++;
        updates.push({
          id: token.id,
          old_wallet: token.wallet_address || "NULL",
          new_wallet: normalizedAddress.substring(0, 10) + "...",
          image_uri: token.image_uri?.substring(0, 30) + "...",
        });
        
        console.log(`✅ [UPDATE-WALLET] Updated token ID ${token.id}`);
      } catch (updateError: any) {
        console.error(`❌ [UPDATE-WALLET] Failed to update token ID ${token.id}:`, updateError);
      }
    }

    console.log(`🎉 [UPDATE-WALLET] SUCCESS: Updated ${updatedCount}/${tokenResult.length} tokens`);

    // Return success HTML
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Update Wallet Address - Success</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .success { color: #38a169; }
            .info { background: #f7fafc; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .token { background: #edf2f7; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 14px; }
            .button { display: inline-block; background: #3182ce; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin-top: 20px; }
            .button:hover { background: #2c5aa0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="success">✅ Update Successful!</h1>
            
            <div class="info">
              <p><strong>User:</strong> ${escapeHtml(user.username)}</p>
              <p><strong>X User ID:</strong> ${escapeHtml(String(xUserId))}</p>
              <p><strong>Wallet Address:</strong> ${escapeHtml(walletAddress)}</p>
              <p><strong>Updated Tokens:</strong> ${updatedCount} of ${tokenResult.length}</p>
            </div>

            <h3>Updated Tokens:</h3>
            ${updates.map(u => `
              <div class="token">
                <strong>Token ID:</strong> ${escapeHtml(String(u.id))}<br>
                <strong>Old Wallet:</strong> ${escapeHtml(u.old_wallet)}<br>
                <strong>New Wallet:</strong> ${escapeHtml(u.new_wallet)}<br>
                <strong>Image URI:</strong> ${escapeHtml(u.image_uri)}
              </div>
            `).join('')}

            <p style="margin-top: 30px;">
              <strong>✅ Wallet update completed successfully.</strong>
            </p>
          </div>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }
    );

  } catch (error: any) {
    console.error("❌ [UPDATE-WALLET] Error:", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Update Wallet Address - Error</title>
          <style>
            body { font-family: Arial; padding: 40px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #e53e3e; }
            .code { background: #f7fafc; padding: 10px; border-radius: 4px; font-family: monospace; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">❌ Error</h1>
            <p>${escapeHtml(error.message)}</p>
            <div class="code">${escapeHtml(error.stack || "")}</div>
          </div>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

