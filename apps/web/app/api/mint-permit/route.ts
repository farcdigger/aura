import { Hono } from "hono";
import { handle } from "hono/vercel";
import { paymentMiddleware, Network } from "x402-hono";
import { facilitator } from "@coinbase/x402";
import { signMintAuth } from "@/lib/eip712";
import { db, tokens } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { env, isMockMode } from "@/env.mjs";
import { ethers } from "ethers";
import type { MintAuth } from "@/lib/types";

// Recipient wallet address - Ödeme alınacak adres
const RECIPIENT_ADDRESS = "0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF";

// Base mainnet USDC contract address
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Contract ABI for querying nonce and owner
const CONTRACT_ABI = [
  "function getNonce(address user) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function usedXUserId(uint256) external view returns (bool)",
  "function owner() external view returns (address)",
];

// Create Hono app
const app = new Hono();

// Apply x402 payment middleware to ALL routes in this file
// CDP facilitator ile Base mainnet üzerinde 0.1 USDC ödemesi alınacak
app.use("*", paymentMiddleware(
  RECIPIENT_ADDRESS,
  {
    "*": {
      price: "$0.1", // 0.1 USDC ödeme
      network: "base" as Network, // Base mainnet
      config: {
        description: "Mint permit for Aura Creatures NFT - Pay 0.1 USDC to mint your unique AI-generated NFT"
      }
    }
  },
  facilitator // CDP facilitator for mainnet - Vercel'de CDP_API_KEY_ID ve CDP_API_KEY_SECRET olmalı
));

// GET request - return method not allowed
app.get("/", (c) => {
  return c.json({ 
    error: "Method Not Allowed",
    message: "This endpoint only accepts POST requests.",
  }, 405);
});

// POST request - Generate mint permit (protected by x402 payment)
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { wallet, x_user_id } = body;
    
    console.log("📝 Mint permit request (after payment verification)");
    console.log(`   Wallet: ${wallet}`);
    console.log(`   X User ID: ${x_user_id}`);
    
    if (!wallet || !x_user_id) {
      return c.json({ error: "Missing required fields" }, 400);
    }
    
    // Validate wallet address
    if (!ethers.isAddress(wallet)) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }
    
    // Convert x_user_id to uint256
    const hash = ethers.id(x_user_id);
    const xUserIdBigInt = BigInt(hash);
    console.log(`Converting x_user_id "${x_user_id}" to uint256: ${hash}`);
    
    // Get provider and contract
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const contractAddress = env.CONTRACT_ADDRESS;
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
    
    // Check if X user ID already minted
    const xUserIdAlreadyMinted = await contract.usedXUserId(xUserIdBigInt);
    if (xUserIdAlreadyMinted) {
      console.warn(`⚠️ X User ID already minted: ${x_user_id}`);
      return c.json({
        error: "X User ID already minted",
        message: "This X account has already minted an NFT. Each X account can only mint once."
      }, 400);
    }
    
    // Get nonce for user
    const nonce = await contract.getNonce(wallet);
    console.log(`User nonce: ${nonce}`);
    
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
          console.log(`✅ Found token metadata for user: ${tokenURI}`);
        } else {
          console.warn(`⚠️ No token metadata found for wallet ${wallet} and X user ${x_user_id}`);
        }
      } catch (dbError) {
        console.error("Database query error:", dbError);
      }
    }
    
    // If no tokenURI from DB, use a placeholder
    if (!tokenURI) {
      tokenURI = `ipfs://QmPlaceholder${Date.now()}`;
      console.warn(`⚠️ Using placeholder tokenURI: ${tokenURI}`);
    }
    
    // Create MintAuth struct
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    const mintAuth: MintAuth = {
      to: wallet,
      payer: wallet,
      xUserId: xUserIdBigInt.toString(), // BigInt as string
      tokenURI: tokenURI,
      nonce: Number(nonce),
      deadline: deadline,
    };
    
    console.log("Signing MintAuth:", mintAuth);
    
    // Sign the mint authorization
    const signature = await signMintAuth(mintAuth);
    console.log(`✅ Signature generated: ${signature.substring(0, 20)}...`);
    
    // Return permit data
    return c.json({
      auth: mintAuth,
      signature: signature,
    });
    
  } catch (error: any) {
    console.error("❌ Error generating mint permit:", error);
    return c.json({
      error: "Internal server error",
      message: error?.message || "Failed to generate mint permit"
    }, 500);
  }
});

// Export handlers for Next.js
export const GET = handle(app);
export const POST = handle(app);
