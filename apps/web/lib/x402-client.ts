/**
 * x402 Payment Client - Frontend helper for x402 payments
 * Uses Daydreams SDK patterns for x402 payment handling
 * 
 * This handles x402 payments for NFT minting (separate from Daydreams image generation payments)
 * Reference: https://docs.daydreams.systems/docs/router/dreams-sdk
 */

import { ethers } from "ethers";

export interface X402PaymentRequest {
  asset: string;
  amount: string;
  network: string;
  recipient: string;
}

export interface X402PaymentResponse {
  x402Version: number;
  accepts: X402PaymentRequest[];
  error?: string;
}

export interface X402PaymentProof {
  paymentId: string;
  amount: string;
  asset: string;
  network: string;
  payer: string;
  recipient: string;
  transactionHash?: string;
  blockNumber?: number;
}

/**
 * Create x402 payment proof from user wallet
 * This simulates the payment flow that Daydreams SDK uses internally
 * 
 * @param paymentRequest - The 402 payment request from server
 * @param walletAddress - User's wallet address
 * @param provider - ethers provider (from wallet)
 * @returns Payment proof that can be sent in X-PAYMENT header
 */
export async function createX402PaymentProof(
  paymentRequest: X402PaymentResponse,
  walletAddress: string,
  provider: ethers.BrowserProvider
): Promise<X402PaymentProof> {
  if (!paymentRequest.accepts || paymentRequest.accepts.length === 0) {
    throw new Error("No payment options in 402 response");
  }

  const paymentOption = paymentRequest.accepts[0];
  
  // For Base Sepolia, we need to handle USDC transfer
  // In production, this would use a payment facilitator or direct USDC transfer
  // For now, we'll create a proof that can be verified server-side
  
  // Check user's USDC balance
  const usdcAddress = getUSDCAddress(paymentOption.network);
  if (!usdcAddress) {
    throw new Error(`USDC not supported on network: ${paymentOption.network}`);
  }

  // Get USDC contract
  const usdcAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
  ];

  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
  
  // Check balance
  const balance = await usdcContract.balanceOf(walletAddress);
  const decimals = await usdcContract.decimals();
  
  // Ensure amount is converted to BigInt safely
  const requiredAmount = BigInt(paymentOption.amount);
  
  // Ensure decimals is a number (ERC20 decimals returns uint8, but might be BigInt from ethers)
  const decimalsNum = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimalsNum)}, Available: ${formatUSDC(balance, decimalsNum)}`
    );
  }

  // In a real implementation, we would:
  // 1. Request user to approve/transfer USDC
  // 2. Wait for transaction confirmation
  // 3. Create payment proof with transaction hash
  
  // For now, return a proof that indicates payment intent
  // Server will need to verify the actual transfer
  return {
    paymentId: `payment_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    amount: paymentOption.amount,
    asset: paymentOption.asset,
    network: paymentOption.network,
    payer: walletAddress,
    recipient: paymentOption.recipient,
  };
}

/**
 * Generate x402 payment header using Daydreams Router pattern
 * This creates a payment header that follows the x402 protocol
 * Reference: https://docs.daydreams.systems/docs/router
 * 
 * Similar to generateX402PaymentBrowser from @daydreamsai/ai-sdk-provider
 * but adapted for our mint payment flow
 * 
 * @param walletAddress - User's wallet address
 * @param signer - ethers signer (from wallet)
 * @param paymentOption - Payment option from 402 response
 * @returns x402-compliant payment header string
 */
export async function generateX402PaymentHeader(
  walletAddress: string,
  signer: ethers.Signer,
  paymentOption: X402PaymentRequest
): Promise<string> {
  // Generate x402 payment header following Daydreams Router pattern
  // This creates a signed payment commitment that can be verified by the server
  // The server will verify the signature and execute the payment on-chain
  
  console.log(`💰 Generating payment header for: ${paymentOption.amount} ${paymentOption.asset} on ${paymentOption.network}`);
  
  // Get USDC contract for balance check
  const usdcAddress = getUSDCAddress(paymentOption.network);
  if (!usdcAddress) {
    throw new Error(
      `USDC not configured for network: ${paymentOption.network}\n\n` +
      `For Base Mainnet, USDC is automatically configured.\n` +
      `If you're using a testnet, set NEXT_PUBLIC_USDC_CONTRACT_ADDRESS environment variable.`
    );
  }

  const usdcAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const provider = signer.provider;
  if (!provider) {
    throw new Error("Signer does not have a provider. Make sure wallet is connected.");
  }

  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
  
  // Check balance
  let balance: bigint;
  let decimalsRaw: bigint | number;
  
  try {
    balance = await usdcContract.balanceOf(walletAddress);
    decimalsRaw = await usdcContract.decimals();
  } catch (balanceError: any) {
    throw new Error(
      `Failed to read USDC balance: ${balanceError.message}\n\n` +
      `Please check your wallet has USDC on ${paymentOption.network}`
    );
  }
  
  // Ensure decimals is always a number
  const decimals = typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : Number(decimalsRaw);
  const requiredAmount = BigInt(paymentOption.amount);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
    );
  }

  // Step 1: Create x402 payment commitment (signed message)
  // This follows the x402 protocol: create a signed payment commitment
  const paymentData = {
    amount: paymentOption.amount,
    asset: paymentOption.asset,
    network: paymentOption.network,
    recipient: paymentOption.recipient,
    payer: walletAddress,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: Math.random().toString(36).substring(7),
  };

  // Sign the payment data using EIP-712
  const domain = {
    name: "X402 Payment",
    version: "1",
    chainId: paymentOption.network === "base" ? 8453 : paymentOption.network === "base-sepolia" ? 84532 : 8453,
    verifyingContract: usdcAddress,
  };

  const types = {
    Payment: [
      { name: "amount", type: "string" },
      { name: "asset", type: "string" },
      { name: "network", type: "string" },
      { name: "recipient", type: "address" },
      { name: "payer", type: "address" },
      { name: "timestamp", type: "uint256" },
      { name: "nonce", type: "string" },
    ],
  };

  const signature = await signer.signTypedData(domain, types, paymentData);
  console.log("✅ Payment commitment signed");

  // Step 2: Execute REAL USDC transfer (x402 requires actual payment)
  // The payment header includes both the commitment AND the transaction proof
  console.log(`💸 Executing USDC transfer: ${formatUSDC(requiredAmount, decimals)} to ${paymentOption.recipient}`);
  
  // Create contract with signer for transfer
  const usdcContractWithSigner = new ethers.Contract(usdcAddress, [
    "function transfer(address to, uint256 amount) returns (bool)",
  ], signer);

  // Execute USDC transfer
  const tx = await usdcContractWithSigner.transfer(paymentOption.recipient, requiredAmount);
  console.log(`📝 Transaction sent: ${tx.hash}`);
  
  // Wait for confirmation
  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

  // Step 3: Create x402-compliant payment header with transaction proof
  // Format: JSON with payment data, signature, AND transaction hash
  const paymentHeader = JSON.stringify({
    ...paymentData,
    signature,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });

  return paymentHeader;
}

/**
 * Get USDC contract address for a network
 * Uses environment variable if set, otherwise defaults
 */
function getUSDCAddress(network: string): string | null {
  // Check if custom USDC address is set in environment (client-side)
  if (typeof window !== "undefined") {
    const customAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
    if (customAddress && customAddress.startsWith("0x") && customAddress.length === 42) {
      console.log(`✅ Using custom USDC address from env: ${customAddress}`);
      return customAddress;
    }
  }
  
  // Base Mainnet USDC (official)
  if (network === "base" || network === "base-mainnet") {
    return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC
  }
  
  // Base Sepolia USDC (testnet - legacy support)
  // Note: Base Sepolia does NOT have official USDC
  if (network === "base-sepolia") {
    console.warn(`⚠️ Base Sepolia does not have official USDC. NEXT_PUBLIC_USDC_CONTRACT_ADDRESS must be set.`);
    return null; // Return null to trigger proper error message
  }
  
  return null;
}

/**
 * Format USDC amount for display
 */
function formatUSDC(amount: bigint, decimals: number): string {
  // CRITICAL: Convert 10 ** decimals to BigInt BEFORE exponentiation
  // This avoids "Cannot mix BigInt and other types" error
  // We need to calculate 10^decimals as BigInt
  
  // Ensure decimals is a number (not BigInt or string)
  const decimalsNum = Number(decimals);
  if (isNaN(decimalsNum) || decimalsNum < 0 || decimalsNum > 255) {
    throw new Error(`Invalid decimals value: ${decimals}`);
  }
  
  // Build divisor as BigInt from scratch (no Number operations)
  let divisor = 1n; // Start with BigInt 1
  for (let i = 0; i < decimalsNum; i++) {
    divisor = divisor * 10n; // Multiply by 10 (BigInt) for each decimal place
  }
  
  // All operations are now BigInt - no mixing!
  const whole = amount / divisor;
  const fraction = amount % divisor;
  
  // Convert BigInt to string for padding (no Number operations)
  const fractionStr = fraction.toString();
  const paddedFraction = fractionStr.padStart(decimalsNum, "0");
  
  return `${whole}.${paddedFraction}`;
}

