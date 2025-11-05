import { NextRequest, NextResponse } from "next/server";
import { createX402Response, verifyX402Payment } from "@/lib/x402";
import { signMintAuth } from "@/lib/eip712";
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
    
    // NOTE: No rate limiting for mint permit requests
    // - Mint requires payment (x402), so spam is naturally limited
    // - Contract already prevents duplicate mints (usedXUserId check)
    // - Existing NFT mint is a legitimate operation, shouldn't be rate limited
    
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
        console.log(`💳 402 Payment Required - Server wallet (recipient): ${serverWallet.address}`);
        const x402Response = createX402Response(serverWallet.address);
        return NextResponse.json(x402Response, { status: 402 });
      }
      
      // Verify payment (with on-chain verification if transaction hash provided)
      paymentVerification = await verifyX402Payment(
        paymentHeader,
        env.X402_FACILITATOR_URL,
        env.RPC_URL
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
      
      // Get nonce from contract (returns BigInt)
      const nonce = await contract.getNonce(wallet);
      console.log(`Contract nonce (BigInt): ${nonce.toString()}, type: ${typeof nonce}`);
      
      // Get token URI from database (from generate step)
      console.log(`Looking for token with x_user_id: ${x_user_id}`);
      let tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.x_user_id, x_user_id))
        .limit(1);
      
      console.log(`Found ${tokenData.length} tokens for x_user_id: ${x_user_id}`);
      
      // Fallback: If Drizzle query failed, try direct Supabase query
      if (!tokenData || tokenData.length === 0) {
        console.log(`⚠️ Drizzle query returned no results, trying direct Supabase query...`);
        try {
          const { supabaseClient } = await import("@/lib/db-supabase");
          if (supabaseClient) {
            const { data, error } = await supabaseClient
              .from("tokens")
              .select("*")
              .eq("x_user_id", x_user_id)
              .limit(1);
            
            if (error) {
              console.error(`Direct Supabase query error:`, error);
            } else if (data && data.length > 0) {
              console.log(`✅ Found token via direct Supabase query`);
              tokenData = data;
            }
          }
        } catch (supabaseError: any) {
          console.error(`Direct Supabase query failed:`, supabaseError.message);
        }
      }
      
      if (!tokenData || tokenData.length === 0) {
        return NextResponse.json({ error: "Token not generated. Please generate first." }, { status: 400 });
      }
      
      const tokenURI = tokenData[0].token_uri || tokenData[0].image_uri;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour (number)
    
      // Convert values to proper types for EIP-712
      // IMPORTANT: We keep these as numbers/strings here, but signMintAuth will convert to strings
      // This avoids BigInt mixing issues in EIP-712 signing
      // xUserId: hash string (0x...) - will be converted to decimal string in signMintAuth
      // nonce: BigInt from contract - convert to number (safe for nonce values)
      // deadline: number - already a number
      const nonceNumber = Number(nonce);
      if (isNaN(nonceNumber) || !Number.isSafeInteger(nonceNumber)) {
        throw new Error(`Invalid nonce value: ${nonce.toString()}. Cannot convert to safe integer.`);
      }
      
      const auth: MintAuth = {
        to: wallet,
        payer: paymentVerification.payer,
        xUserId: hash, // Hash string (0x...) - will be converted to decimal string in signMintAuth
        tokenURI,
        nonce: nonceNumber, // Number - will be converted to string in signMintAuth
        deadline, // Number - will be converted to string in signMintAuth
      };
      
      // Log values to debug BigInt conversion issues
      console.log("MintAuth values (before EIP-712 conversion):", {
        to: auth.to,
        payer: auth.payer,
        xUserId: auth.xUserId,
        xUserIdType: typeof auth.xUserId,
        nonce: auth.nonce,
        nonceType: typeof auth.nonce,
        nonceOriginal: nonce.toString(),
        deadline: auth.deadline,
        deadlineType: typeof auth.deadline,
      });
      
      // Check contract owner before signing
      let ownerAddress: string | null = null;
      try {
        ownerAddress = await contract.owner();
        console.log(`📋 Contract owner: ${ownerAddress}`);
        
        // Get server signer address
        if (env.SERVER_SIGNER_PRIVATE_KEY) {
          const serverWallet = new ethers.Wallet(env.SERVER_SIGNER_PRIVATE_KEY);
          const serverAddress = serverWallet.address;
          console.log(`🔐 Server signer address: ${serverAddress}`);
          
          if (serverAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
            console.error(`❌ CRITICAL: Server signer address does NOT match contract owner!`);
            console.error(`   Server signer: ${serverAddress}`);
            console.error(`   Contract owner: ${ownerAddress}`);
            console.error(`   ⚠️ SERVER_SIGNER_PRIVATE_KEY must correspond to the contract owner wallet!`);
            return NextResponse.json({ 
              error: `Server signer address does not match contract owner. Server: ${serverAddress}, Owner: ${ownerAddress}`,
              hint: "SERVER_SIGNER_PRIVATE_KEY must be the private key of the contract owner wallet"
            }, { status: 500 });
          }
          console.log(`✅ Server signer matches contract owner`);
        }
      } catch (ownerError: any) {
        console.warn(`⚠️ Could not verify contract owner: ${ownerError.message}`);
      }
      
      // Sign mint auth with detailed logging
      console.log("🔐 Signing MintAuth with server wallet...");
      console.log("🔐 MintAuth values being signed:", {
        to: auth.to,
        payer: auth.payer,
        xUserId: auth.xUserId,
        tokenURI: auth.tokenURI?.substring(0, 50) + "...",
        nonce: auth.nonce,
        deadline: auth.deadline,
      });
      
      const signature = await signMintAuth(auth);
      
      console.log("✅ MintAuth signature generated:", signature.substring(0, 20) + "...");
      console.log("🔐 Full signature length:", signature.length);
      
      // Verify signature can be recovered (double-check)
      try {
        const { verifyMintAuth } = await import("@/lib/eip712");
        const recoveredAddress = await verifyMintAuth(auth, signature);
        if (!recoveredAddress) {
          console.error("❌ CRITICAL: Generated signature verification failed!");
          return NextResponse.json({ 
            error: "Signature verification failed after generation",
            hint: "Check EIP-712 domain name and contract address"
          }, { status: 500 });
        }
        console.log("✅ Signature self-verification passed, recovered address:", recoveredAddress);
        
        // Verify recovered address matches contract owner
        if (ownerAddress) {
          if (recoveredAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
            console.error(`❌ CRITICAL: Recovered address does NOT match contract owner!`);
            console.error(`   Recovered: ${recoveredAddress}`);
            console.error(`   Owner: ${ownerAddress}`);
            return NextResponse.json({ 
              error: `Signature verification failed: recovered address does not match owner`,
              hint: "Check EIP-712 domain name matches contract name ('Aura Creatures')"
            }, { status: 500 });
          }
          console.log("✅ Recovered address matches contract owner");
        } else {
          console.warn(`⚠️ Could not verify recovered address against contract owner (owner address not available)`);
        }
      } catch (verifyError: any) {
        console.error(`❌ Signature self-verification error: ${verifyError.message}`);
        return NextResponse.json({ 
          error: `Signature verification failed: ${verifyError.message}`,
          hint: "Check EIP-712 domain configuration"
        }, { status: 500 });
      }
      
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

