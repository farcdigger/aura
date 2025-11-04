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
  const requiredAmount = BigInt(paymentOption.amount);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
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
 * Execute x402 payment (transfer USDC)
 * This performs the actual USDC transfer to the recipient
 * 
 * @param paymentRequest - The 402 payment request
 * @param signer - ethers signer (from wallet)
 * @returns Transaction hash and payment proof
 */
export async function executeX402Payment(
  paymentRequest: X402PaymentResponse,
  signer: ethers.Signer
): Promise<{ txHash: string; proof: X402PaymentProof }> {
  if (!paymentRequest.accepts || paymentRequest.accepts.length === 0) {
    throw new Error("No payment options in 402 response");
  }

  const paymentOption = paymentRequest.accepts[0];
  const walletAddress = await signer.getAddress();

  // Get USDC contract
  const usdcAddress = getUSDCAddress(paymentOption.network);
  if (!usdcAddress) {
    throw new Error(`USDC not supported on network: ${paymentOption.network}`);
  }

  const usdcAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
  ];

  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);
  
  // Check balance
  const balance = await usdcContract.balanceOf(walletAddress);
  const decimals = await usdcContract.decimals();
  const requiredAmount = BigInt(paymentOption.amount);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
    );
  }

  // Transfer USDC
  console.log(`💸 Transferring ${formatUSDC(requiredAmount, decimals)} USDC to ${paymentOption.recipient}`);
  const tx = await usdcContract.transfer(paymentOption.recipient, requiredAmount);
  console.log(`📝 Transaction sent: ${tx.hash}`);
  
  // Wait for confirmation
  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

  // Create payment proof
  const proof: X402PaymentProof = {
    paymentId: `payment_${receipt.blockNumber}_${tx.hash.substring(2, 10)}`,
    amount: paymentOption.amount,
    asset: paymentOption.asset,
    network: paymentOption.network,
    payer: walletAddress,
    recipient: paymentOption.recipient,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };

  return {
    txHash: receipt.hash,
    proof,
  };
}

/**
 * Get USDC contract address for a network
 * Uses environment variable if set, otherwise defaults
 */
function getUSDCAddress(network: string): string | null {
  // Check if custom USDC address is set in environment (client-side)
  if (typeof window !== "undefined") {
    const customAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
    if (customAddress && customAddress.startsWith("0x")) {
      return customAddress;
    }
  }
  
  // Base Sepolia USDC (testnet)
  // Note: Base Sepolia does NOT have official USDC
  // You need to deploy a test ERC20 token or use a faucet token
  // Common options:
  // 1. Deploy your own test USDC token
  // 2. Use a test token from Base Sepolia faucet
  // 3. Use a different testnet that has USDC (like Sepolia)
  if (network === "base-sepolia" || network === "base") {
    // Default: Try to read from environment or use placeholder
    // IMPORTANT: Replace this with your deployed test USDC address
    // You can set NEXT_PUBLIC_USDC_CONTRACT_ADDRESS in Vercel environment variables
    return "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia test USDC (UPDATE THIS or set env var!)
  }
  
  // Base Mainnet USDC
  if (network === "base-mainnet") {
    return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC
  }
  
  return null;
}

/**
 * Format USDC amount for display
 */
function formatUSDC(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

