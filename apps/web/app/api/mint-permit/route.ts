/**
 * Mint Permit API with x402 Payment (CDP Facilitator)
 * 
 * CDP Docs: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
 * 
 * Bu endpoint CDP facilitator kullanarak x402 protokolü ile:
 * 1. Kullanıcıdan 0.1 USDC ödemesi alır (facilitator verify eder)
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
const PAYMENT_AMOUNT = "$0.1"; // CDP facilitator $ formatını kullanır
const NETWORK = "base"; // Base mainnet

// Contract ABI
const CONTRACT_ABI = [
  "function getNonce(address user) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function usedXUserId(uint256) external view returns (bool)",
  "function owner() external view returns (address)",
];

/**
 * CDP Facilitator ile ödeme doğrulama
 * 
 * Döküman: https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works
 */
async function verifyPaymentWithFacilitator(paymentHeader: string): Promise<boolean> {
  try {
    // @coinbase/x402 facilitator'ı kullan
    const { facilitator } = await import("@coinbase/x402");
    
    console.log("🔍 Verifying payment with CDP facilitator...");
    
    // Facilitator verify fonksiyonu
    const isValid = await facilitator.verifyPayment({
      payment: paymentHeader,
      expectedRecipient: RECIPIENT_ADDRESS,
      expectedAmount: PAYMENT_AMOUNT,
      network: NETWORK
    });
    
    if (isValid) {
      console.log("✅ Payment verified by CDP facilitator!");
      return true;
    } else {
      console.log("❌ Payment verification failed");
      return false;
    }
    
  } catch (error) {
    console.error("❌ Facilitator verification error:", error);
    return false;
  }
}

/**
 * x402 Response - 402 Payment Required
 * CDP Facilitator formatına göre
 */
function create402Response(requestUrl: string) {
  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [
        {
          price: PAYMENT_AMOUNT,
          network: NETWORK,
          recipient: RECIPIENT_ADDRESS,
          resource: requestUrl,
          description: "Mint permit for Aura Creatures NFT - Pay 0.1 USDC to mint your unique AI-generated NFT",
          mimeType: "application/json",
        }
      ]
    },
    { 
      status: 402,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
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
 * POST - Mint permit with CDP x402 payment
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
      const requestUrl = request.url;
      return create402Response(requestUrl);
    }
    
    // Verify payment with CDP facilitator
    console.log("🔍 Payment header received, verifying with CDP facilitator...");
    const isPaymentValid = await verifyPaymentWithFacilitator(paymentHeader);
    
    if (!isPaymentValid) {
      // Payment verification failed - return 402 again
      console.log("❌ Payment verification failed");
      const requestUrl = request.url;
      return create402Response(requestUrl);
    }
    
    console.log("✅ Payment verified by CDP facilitator!");
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
