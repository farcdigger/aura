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
  signer: ethers.Signer & { provider: ethers.Provider }
): Promise<{ txHash: string; proof: X402PaymentProof }> {
  if (!paymentRequest.accepts || paymentRequest.accepts.length === 0) {
    throw new Error("No payment options in 402 response");
  }

  const paymentOption = paymentRequest.accepts[0];
  const walletAddress = await signer.getAddress();

  // Get USDC contract
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
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
  ];

  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);
  
  // Verify contract exists and is valid (check if code exists)
  // Note: This check is done at runtime (client-side), not at build time
  try {
    // Get provider from signer - type assertion ensures provider exists
    const provider = signer.provider;
    if (!provider) {
      throw new Error("Signer does not have a provider. Make sure wallet is connected.");
    }
    
    // getCode is async, so we await it
    const code = await provider.getCode(usdcAddress);
    if (!code || code === "0x") {
      throw new Error(
        `Invalid USDC contract address: ${usdcAddress}\n\n` +
        `No contract found at this address on ${paymentOption.network}.\n` +
        `Please deploy a test USDC token or update NEXT_PUBLIC_USDC_CONTRACT_ADDRESS.`
      );
    }
  } catch (codeError: any) {
    // If it's already our custom error, rethrow it
    if (codeError?.message && codeError.message.includes("Invalid USDC contract address")) {
      throw codeError;
    }
    // Otherwise, wrap in a more helpful error
    throw new Error(
      `Failed to verify USDC contract: ${codeError?.message || 'Unknown error'}\n\n` +
      `Please check that NEXT_PUBLIC_USDC_CONTRACT_ADDRESS is set correctly.`
    );
  }
  
  // Check balance (with better error handling)
  let balance: bigint;
  let decimals: number;
  
  try {
    balance = await usdcContract.balanceOf(walletAddress);
    decimals = await usdcContract.decimals();
  } catch (balanceError: any) {
    // If balanceOf fails, the contract might not be a valid ERC20 token
    throw new Error(
      `Failed to read USDC balance from contract at ${usdcAddress}.\n\n` +
      `Error: ${balanceError.message}\n\n` +
      `This address may not be a valid ERC20 token. Please:\n` +
      `1. Verify the contract is deployed and is an ERC20 token\n` +
      `2. Check NEXT_PUBLIC_USDC_CONTRACT_ADDRESS is correct\n` +
      `3. For Base Mainnet, USDC should be at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
    );
  }
  
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
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

