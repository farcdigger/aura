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
 * Ödeme doğrulama - USDC Permit signature verification
 * 
 * x402-fetch'in gönderdiği payment header formatı:
 * {
 *   owner: address,
 *   spender: address,
 *   value: string,
 *   deadline: number,
 *   v: number,
 *   r: string,
 *   s: string
 * }
 */
async function verifyPayment(paymentHeader: string, payerAddress: string): Promise<boolean> {
  try {
    console.log("🔍 Verifying USDC permit signature...");
    
    const payment = JSON.parse(paymentHeader);
    console.log("Payment data:", {
      owner: payment.owner,
      spender: payment.spender,
      value: payment.value,
      deadline: payment.deadline
    });
    
    // Validate payment fields
    if (!payment.owner || !payment.spender || !payment.value || !payment.deadline) {
      console.error("❌ Invalid payment format");
      return false;
    }
    
    // Verify owner matches payer
    if (payment.owner.toLowerCase() !== payerAddress.toLowerCase()) {
      console.error("❌ Payment owner doesn't match wallet address");
      return false;
    }
    
    // Verify spender is our recipient
    if (payment.spender.toLowerCase() !== RECIPIENT_ADDRESS.toLowerCase()) {
      console.error("❌ Payment spender doesn't match recipient");
      return false;
    }
    
    // Verify amount (at least the required amount)
    const paymentValue = BigInt(payment.value);
    const requiredValue = BigInt(PAYMENT_AMOUNT);
    if (paymentValue < requiredValue) {
      console.error(`❌ Insufficient payment: ${paymentValue} < ${requiredValue}`);
      return false;
    }
    
    // Verify deadline hasn't passed
    const now = Math.floor(Date.now() / 1000);
    if (payment.deadline < now) {
      console.error("❌ Payment deadline has passed");
      return false;
    }
    
    // Verify signature using ethers
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const usdcContract = new ethers.Contract(
      BASE_USDC_ADDRESS,
      [
        "function nonces(address owner) view returns (uint256)",
        "function name() view returns (string)",
        "function version() view returns (string)"
      ],
      provider
    );
    
    // Get nonce for EIP-712 verification
    const nonce = await usdcContract.nonces(payment.owner);
    
    // EIP-712 domain for USDC on Base
    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: 8453, // Base mainnet
      verifyingContract: BASE_USDC_ADDRESS
    };
    
    // EIP-712 types for Permit
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    
    // Message to verify
    const message = {
      owner: payment.owner,
      spender: payment.spender,
      value: payment.value,
      nonce: nonce.toString(),
      deadline: payment.deadline
    };
    
    // Recover signer from signature
    const signature = ethers.Signature.from({
      v: payment.v,
      r: payment.r,
      s: payment.s
    });
    
    const digest = ethers.TypedDataEncoder.hash(domain, types, message);
    const recoveredAddress = ethers.recoverAddress(digest, signature);
    
    console.log("Recovered signer:", recoveredAddress);
    console.log("Expected owner:", payment.owner);
    
    if (recoveredAddress.toLowerCase() !== payment.owner.toLowerCase()) {
      console.error("❌ Signature verification failed");
      return false;
    }
    
    console.log("✅ Payment signature verified successfully!");
    return true;
    
  } catch (error) {
    console.error("❌ Payment verification error:", error);
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
    
    // Verify payment
    console.log("🔍 Payment header received, verifying...");
    const isPaymentValid = await verifyPayment(paymentHeader, wallet);
    
    if (!isPaymentValid) {
      // Payment verification failed - return 402 again
      console.log("❌ Payment verification failed");
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

