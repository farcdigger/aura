/**
 * x402 Payment Client - Frontend helper for x402 payments
 * Uses Coinbase CDP x402 protocol
 * Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
 */

import { ethers } from "ethers";

export interface X402PaymentRequest {
  asset: string;
  amount: string;
  network: string;
  recipient: string;
  extra?: {
    name?: string;
    version?: string;
  };
}

export interface X402PaymentResponse {
  x402Version: number;
  accepts: X402PaymentRequest[];
  error?: string;
}

/**
 * Generate x402 payment header
 * User signs EIP-712 payment commitment
 * Middleware verifies and executes USDC transfer via facilitator
 */
export async function generateX402PaymentHeader(
  walletAddress: string,
  signer: ethers.Signer,
  paymentOption: X402PaymentRequest
): Promise<string> {
  console.log(`💰 Creating x402 payment header`);
  console.log(`   Amount: ${paymentOption.amount} ${paymentOption.asset}`);
  console.log(`   Network: ${paymentOption.network}`);
  console.log(`   Recipient: ${paymentOption.recipient}`);
  
  // Get USDC contract address for the network
  const usdcAddress = getUSDCAddress(paymentOption.network);
  if (!usdcAddress) {
    throw new Error(`USDC not configured for network: ${paymentOption.network}`);
  }

  // Validate addresses
  if (!ethers.isAddress(paymentOption.recipient)) {
    throw new Error(`Invalid recipient address: ${paymentOption.recipient}`);
  }
  
  if (!ethers.isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
  
  // Normalize addresses (no ENS resolution)
  const normalizedRecipient = ethers.getAddress(paymentOption.recipient);
  const normalizedPayer = ethers.getAddress(walletAddress);
  const normalizedUsdcAddress = ethers.getAddress(usdcAddress);
  
  // Determine chain ID
  const chainId = paymentOption.network === "base" ? 8453 : 
                  paymentOption.network === "base-sepolia" ? 84532 : 8453;
  
  // EIP-712 domain - Use EXACT values from middleware's 402 response (extra field)
  // Middleware returns: "extra": { "name": "USD Coin", "version": "2" }
  // We MUST use these exact values for signature verification to work
  const domain = {
    name: paymentOption.extra?.name || "USD Coin",
    version: paymentOption.extra?.version || "2",
    chainId: chainId,
    verifyingContract: normalizedUsdcAddress,
  };
  
  console.log(`📋 EIP-712 Domain:`, domain);

  // EIP-712 types for x402 payment
  const types = {
    TransferWithAuthorization: [
      { name: "amount", type: "string" },
      { name: "asset", type: "string" },
      { name: "network", type: "string" },
      { name: "recipient", type: "address" },
      { name: "payer", type: "address" },
      { name: "timestamp", type: "uint256" },
      { name: "nonce", type: "string" },
    ],
  };

  // Payment message
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(7);
  
  // Use EXACT values from paymentOption
  const message = {
    amount: paymentOption.amount,
    asset: paymentOption.asset, // EXACT value from middleware
    network: paymentOption.network,
    recipient: normalizedRecipient,
    payer: normalizedPayer,
    timestamp: timestamp,
    nonce: nonce,
  };
  
  console.log(`📋 Payment message:`, message);

  // Sign EIP-712 payment commitment
  console.log(`📝 Requesting signature...`);
  const signature = await signer.signTypedData(domain, types, message);
  
  // Create x402 payment header
  const paymentData = {
    ...message,
    signature,
  };
  
  const paymentHeader = JSON.stringify(paymentData);
  
  console.log(`✅ Payment header created`);
  console.log(`   Signature: ${signature.substring(0, 20)}...`);
  console.log(`📤 FULL PAYMENT HEADER (for debugging):`);
  console.log(paymentHeader);
  console.log(`📤 Payment header length: ${paymentHeader.length} chars`);
  
  return paymentHeader;
}

/**
 * Get USDC contract address for a network
 */
function getUSDCAddress(network: string): string | null {
  // Check environment variable first
  if (typeof window !== "undefined") {
    const customAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
    if (customAddress && customAddress.startsWith("0x") && customAddress.length === 42) {
      console.log(`✅ Using custom USDC address: ${customAddress}`);
      return customAddress;
    }
  }
  
  // Base Mainnet USDC (official)
  if (network === "base" || network === "base-mainnet") {
    return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  }
  
  // Base Sepolia - no official USDC
  if (network === "base-sepolia") {
    console.warn(`⚠️ Base Sepolia has no official USDC`);
    return null;
  }
  
  return null;
}
