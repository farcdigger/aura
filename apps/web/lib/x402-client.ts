/**
 * x402 Payment Client - Frontend helper for x402 payments
 * Uses Coinbase CDP x402 protocol via x402-next middleware
 * 
 * IMPORTANT: This generates a payment commitment that x402-next middleware verifies
 * The middleware handles the actual USDC transfer via CDP facilitator
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
 * Generate x402 payment header for x402-next middleware
 * 
 * The middleware will:
 * 1. Verify this payment commitment signature
 * 2. Call CDP facilitator to execute USDC transfer
 * 3. Return the actual API response (mint permit)
 */
export async function generateX402PaymentHeader(
  walletAddress: string,
  signer: ethers.Signer,
  paymentOption: X402PaymentRequest
): Promise<string> {
  console.log(`💰 Creating x402 payment header for middleware`);
  console.log(`   Amount: ${paymentOption.amount} ${paymentOption.asset}`);
  console.log(`   Network: ${paymentOption.network}`);
  console.log(`   Recipient: ${paymentOption.recipient}`);
  
  // Validate addresses
  if (!ethers.isAddress(paymentOption.recipient)) {
    throw new Error(`Invalid recipient address: ${paymentOption.recipient}`);
  }
  
  if (!ethers.isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
  
  // Normalize addresses
  const normalizedRecipient = ethers.getAddress(paymentOption.recipient);
  const normalizedPayer = ethers.getAddress(walletAddress);
  const normalizedAsset = ethers.getAddress(paymentOption.asset);
  
  // Base mainnet chain ID
  const chainId = 8453; // Always use Base mainnet
  
  // EIP-712 domain - Use values from middleware's 402 response
  const domain = {
    name: paymentOption.extra?.name || "USD Coin",
    version: paymentOption.extra?.version || "2",
    chainId: chainId,
    verifyingContract: normalizedAsset, // USDC contract
  };
  
  console.log(`📋 EIP-712 Domain:`, domain);

  // x402 payment commitment type
  // This is verified by x402-next middleware
  const types = {
    Payment: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "string" },
      { name: "asset", type: "address" },
      { name: "network", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };

  // Payment message
  const timestamp = Math.floor(Date.now() / 1000);
  
  const message = {
    from: normalizedPayer,
    to: normalizedRecipient,
    amount: paymentOption.amount, // Amount in USDC base units (5 USDC = 5_000_000)
    asset: normalizedAsset,
    network: paymentOption.network,
    timestamp: timestamp,
  };
  
  console.log(`📋 Payment message:`, message);
  console.log(`   From: ${message.from}`);
  console.log(`   To: ${message.to}`);
  console.log(`   Amount: ${message.amount} (${(parseInt(message.amount) / 1_000_000).toFixed(2)} USDC)`);
  console.log(`   Asset: ${message.asset}`);
  console.log(`   Network: ${message.network}`);
  console.log(`   Timestamp: ${new Date(timestamp * 1000).toISOString()}`);

  // Sign EIP-712 payment commitment
  console.log(`📝 Requesting EIP-712 signature from wallet...`);
  const signature = await signer.signTypedData(domain, types, message);
  
  // Create x402 payment header - middleware expects this format
  const paymentData = {
    ...message,
    signature,
  };
  
  const paymentHeader = JSON.stringify(paymentData);
  
  console.log(`✅ Payment header created for x402-next middleware`);
  console.log(`   Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}`);
  console.log(`📤 Payment header length: ${paymentHeader.length} chars`);
  
  return paymentHeader;
}
