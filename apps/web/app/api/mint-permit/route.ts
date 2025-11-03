import { NextRequest, NextResponse } from "next/server";
import { createX402Response, verifyX402Payment } from "@/lib/x402";
import { signMintAuth } from "@/lib/eip712";
import { checkMintRateLimit } from "@/lib/rate-limit";
import { db, tokens } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { env, isMockMode } from "@/env.mjs";
import { ethers } from "ethers";
import type { MintPermitRequest, MintAuth } from "@/lib/types";

// Contract ABI for querying nonce
const CONTRACT_ABI = [
  "function getNonce(address user) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function usedXUserId(uint256) external view returns (bool)",
];

export async function POST(request: NextRequest) {
  try {
    const body: MintPermitRequest = await request.json();
    const { wallet, x_user_id } = body;
    
    if (!wallet || !x_user_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Validate wallet address
    if (!ethers.isAddress(wallet)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    
    // Convert x_user_id to uint256 (hash the string to get a unique uint256)
    // This ensures we can use any string format (X user ID, test ID, etc.)
    const hash = ethers.id(x_user_id); // keccak256 hash (returns 0x prefix)
    const xUserIdBigInt = BigInt(hash); // Convert to BigInt for uint256
    console.log(`Converting x_user_id "${x_user_id}" to uint256: ${hash}`);
    
    // Rate limiting
    const allowed = await checkMintRateLimit(wallet);
    if (!allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    
    // Check X-PAYMENT header (only in production)
    const paymentHeader = request.headers.get("X-PAYMENT");
    
    let paymentVerification: any = null;
    
    if (!isMockMode) {
      // Production mode - require x402 payment
      if (!paymentHeader) {
        // First request - return 402 payment required
        if (!env.SERVER_SIGNER_PRIVATE_KEY) {
          return NextResponse.json({ error: "SERVER_SIGNER_PRIVATE_KEY not configured" }, { status: 500 });
        }
        const serverWallet = new ethers.Wallet(env.SERVER_SIGNER_PRIVATE_KEY);
        const x402Response = createX402Response(serverWallet.address);
        return NextResponse.json(x402Response, { status: 402 });
      }
      
      // Verify payment
      paymentVerification = await verifyX402Payment(
        paymentHeader,
        env.X402_FACILITATOR_URL
      );
      
      if (!paymentVerification) {
        return NextResponse.json({ error: "Payment verification failed" }, { status: 402 });
      }
    } else {
      // Mock mode - use wallet as payer for testing
      console.log("🐛 Mock mode: Skipping x402 payment verification");
      paymentVerification = {
        payer: wallet,
        amount: env.X402_PRICE_USDC,
        asset: "USDC",
        network: "base",
        recipient: wallet, // In test mode, we don't actually charge
      };
    }
    
    // Check contract: if user already minted
    if (!env.RPC_URL || !env.CONTRACT_ADDRESS) {
      return NextResponse.json({ error: "RPC_URL or CONTRACT_ADDRESS not configured" }, { status: 500 });
    }
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const contract = new ethers.Contract(env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    try {
      const alreadyMinted = await contract.usedXUserId(xUserIdBigInt);
      if (alreadyMinted) {
        return NextResponse.json({ error: "X user already minted" }, { status: 400 });
      }
      
      // Check supply
      const totalSupply = await contract.totalSupply();
      const maxSupply = await contract.MAX_SUPPLY();
      if (totalSupply >= maxSupply) {
        return NextResponse.json({ error: "Max supply reached" }, { status: 400 });
      }
      
      // Get nonce from contract
      const nonce = await contract.getNonce(wallet);
      
      // Get token URI from database (from generate step)
      console.log(`Looking for token with x_user_id: ${x_user_id}`);
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.x_user_id, x_user_id))
        .limit(1);
      
      console.log(`Found ${tokenData.length} tokens for x_user_id: ${x_user_id}`);
      
      if (!tokenData || tokenData.length === 0) {
        return NextResponse.json({ error: "Token not generated. Please generate first." }, { status: 400 });
      }
      
      const tokenURI = tokenData[0].token_uri;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
      const auth: MintAuth = {
        to: wallet,
        payer: paymentVerification.payer,
        xUserId: hash, // Use hash string (will be converted to BigInt by ethers)
        tokenURI,
        nonce: Number(nonce),
        deadline,
      };
      
      // Sign mint auth
      const signature = await signMintAuth(auth);
      
      return NextResponse.json({
        auth,
        signature,
      });
    } catch (error) {
      console.error("Contract query error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to query contract" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Mint permit error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mint permit failed" },
      { status: 500 }
    );
  }
}

