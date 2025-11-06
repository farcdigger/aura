/**
 * Mint Permit API - x402 Payment Protocol
 * 
 * Bu endpoint x402 protokolünü kullanarak:
 * 1. Kullanıcıdan 0.1 USDC ödemesi alır
 * 2. Ödeme doğrulandıktan sonra mint permit verir
 */

import { NextRequest, NextResponse } from "next/server";
import { signMintAuth } from "@/lib/eip712";
import { db, tokens } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { env, isMockMode } from "@/env.mjs";
import { ethers } from "ethers";
import type { MintAuth } from "@/lib/types";

// Ödeme bilgileri
const RECIPIENT_ADDRESS = "0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF";
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMENT_AMOUNT = "100000"; // 0.1 USDC (6 decimals)
const NETWORK = "base";

// Contract ABI
const CONTRACT_ABI = [
  "function getNonce(address user) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function usedXUserId(uint256) external view returns (bool)",
  "function owner() external view returns (address)",
];

/**
 * x402 Response - 402 Payment Required
 */
function create402Response() {
  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: PAYMENT_AMOUNT,
          resource: `${env.NEXT_PUBLIC_SUPABASE_URL || 'https://aura-nft-iota.vercel.app'}/api/mint-permit-v2`,
          description: "Mint permit for Aura Creatures NFT - Pay 0.1 USDC to mint your unique AI-generated NFT",
          mimeType: "application/json",
          payTo: RECIPIENT_ADDRESS,
          maxTimeoutSeconds: 300,
          asset: BASE_USDC_ADDRESS,
          extra: {
            name: "USD Coin",
            version: "2"
          }
        }
      ]
    },
    { 
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true"
      }
    }
  );
}

/**
 * CDP Facilitator API - Ödeme doğrulama
 * 
 * API Docs: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/verify-a-payment
 * 
 * CDP Facilitator kullanarak x402 payment verification
 */
async function verifyPaymentWithCDPFacilitator(paymentPayload: any): Promise<boolean> {
  try {
    console.log("🔍 Verifying payment with CDP Facilitator API...");
    
    // CDP API için Bearer token oluştur
    const apiKeyName = env.CDP_API_KEY_ID;
    const apiKeySecret = env.CDP_API_KEY_SECRET;
    
    if (!apiKeyName || !apiKeySecret) {
      console.error("❌ CDP API keys not configured");
      return false;
    }
    
    // JWT token oluştur (CDP dökümanlarına göre)
    const token = Buffer.from(`${apiKeyName}:${apiKeySecret}`).toString('base64');
    
    // CDP Facilitator API endpoint
    const facilitatorUrl = "https://api.cdp.coinbase.com/platform/v2/x402/verify";
    
    // Payment requirements
    const paymentRequirements = {
      scheme: "exact",
      network: NETWORK,
      maxAmountRequired: PAYMENT_AMOUNT,
      resource: `/api/mint-permit-v2`,
      description: "Mint permit for Aura Creatures NFT - Pay 0.1 USDC to mint your unique AI-generated NFT",
      mimeType: "application/json",
      payTo: RECIPIENT_ADDRESS,
      maxTimeoutSeconds: 300,
      asset: BASE_USDC_ADDRESS
    };
    
    // API request body
    const requestBody = {
      x402Version: 1,
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements
    };
    
    console.log("📤 Sending verification request to CDP Facilitator...");
    
    const response = await fetch(facilitatorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ CDP Facilitator API error:", response.status, errorText);
      return false;
    }
    
    const result = await response.json();
    console.log("📥 CDP Facilitator response:", result);
    
    // Check if payment is valid
    if (result.isValid === true) {
      console.log("✅ Payment verified by CDP Facilitator!");
      console.log(`   Payer: ${result.payer}`);
      return true;
    } else {
      console.error("❌ Payment verification failed");
      console.error(`   Reason: ${result.invalidReason || 'Unknown'}`);
      return false;
    }
    
  } catch (error) {
    console.error("❌ CDP Facilitator verification error:", error);
    return false;
  }
}

/**
 * GET - Method not allowed
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: "Method Not Allowed",
      message: "This endpoint only accepts POST requests."
    },
    { status: 405 }
  );
}

/**
 * POST - Mint permit with x402 payment
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, x_user_id } = body;
    
    // Validate input
    if (!wallet || !x_user_id) {
      return NextResponse.json(
        { error: "Missing required fields: wallet and x_user_id" },
        { status: 400 }
      );
    }
    
    if (!ethers.isAddress(wallet)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }
    
    // x402 Protocol: Check for payment header
    const paymentHeader = request.headers.get("x-payment");
    
    if (!paymentHeader) {
      // No payment provided - return 402 Payment Required
      console.log("💳 No payment header - returning 402");
      return create402Response();
    }
    
    // Parse payment payload from header
    let paymentPayload;
    try {
      paymentPayload = JSON.parse(paymentHeader);
    } catch (error) {
      console.error("❌ Invalid payment header format");
      return create402Response();
    }
    
    // Verify payment with CDP Facilitator API
    console.log("🔍 Payment header received, verifying with CDP Facilitator...");
    const isPaymentValid = await verifyPaymentWithCDPFacilitator(paymentPayload);
    
    if (!isPaymentValid) {
      // Payment verification failed - return 402 again
      console.log("❌ CDP Facilitator verification failed");
      return create402Response();
    }
    
    console.log("✅ Payment verified successfully!");
    console.log(`📝 Generating mint permit for wallet: ${wallet}, X user: ${x_user_id}`);
    
    // Convert x_user_id to uint256
    const hash = ethers.id(x_user_id);
    const xUserIdBigInt = BigInt(hash);
    
    // Get provider and contract
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const contract = new ethers.Contract(env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Check if X user ID already minted
    const xUserIdAlreadyMinted = await contract.usedXUserId(xUserIdBigInt);
    if (xUserIdAlreadyMinted) {
      return NextResponse.json(
        {
          error: "X User ID already minted",
          message: "This X account has already minted an NFT. Each X account can only mint once."
        },
        { status: 400 }
      );
    }
    
    // Get nonce
    const nonce = await contract.getNonce(wallet);
    
    // Get token metadata from database
    let tokenURI = null;
    if (!isMockMode && db) {
      try {
        const userToken = await db
          .select()
          .from(tokens)
          .where(
            and(
              eq(tokens.walletAddress, wallet.toLowerCase()),
              eq(tokens.xUserId, x_user_id)
            )
          )
          .limit(1);
        
        if (userToken && userToken.length > 0) {
          tokenURI = userToken[0].metadataUri;
          console.log(`✅ Found token metadata: ${tokenURI}`);
        }
      } catch (dbError) {
        console.error("Database error:", dbError);
      }
    }
    
    // Fallback tokenURI
    if (!tokenURI) {
      tokenURI = `ipfs://QmPlaceholder${Date.now()}`;
      console.warn(`⚠️ Using placeholder tokenURI: ${tokenURI}`);
    }
    
    // Create MintAuth
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const mintAuth: MintAuth = {
      to: wallet,
      payer: wallet,
      xUserId: xUserIdBigInt.toString(),
      tokenURI: tokenURI,
      nonce: Number(nonce),
      deadline: deadline,
    };
    
    // Sign mint authorization
    const signature = await signMintAuth(mintAuth);
    console.log(`✅ Mint permit signed successfully`);
    
    return NextResponse.json({
      auth: mintAuth,
      signature: signature,
    });
    
  } catch (error: any) {
    console.error("❌ Error in mint-permit:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error?.message || "Failed to generate mint permit"
      },
      { status: 500 }
    );
  }
}

