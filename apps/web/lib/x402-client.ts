/**
 * x402 Payment Client - Frontend helper for x402 payments
 * Uses Daydreams SDK patterns for x402 payment handling
 * 
 * This handles x402 payments for NFT minting (separate from Daydreams image generation payments)
 * Reference: https://docs.daydreams.systems/docs/router/dreams-sdk
 */

import { ethers } from "ethers";
import { generateX402PaymentBrowser } from "@daydreamsai/ai-sdk-provider";

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
 * Generate x402 payment header using Daydreams SDK
 * This uses the official Daydreams SDK function for x402 payments
 * Reference: https://docs.daydreams.systems/docs/router
 * 
 * Uses generateX402PaymentBrowser from @daydreamsai/ai-sdk-provider
 * This creates a payment header that the user signs ONCE in their wallet
 * 
 * @param walletAddress - User's wallet address
 * @param signTypedDataAsync - wagmi signTypedDataAsync function (or ethers equivalent)
 * @param paymentOption - Payment option from 402 response
 * @returns x402-compliant payment header string
 */
export async function generateX402PaymentHeader(
  walletAddress: string,
  signer: ethers.Signer,
  paymentOption: X402PaymentRequest
): Promise<string> {
  // x402 Payment Flow: Single approval for USDC transfer
  // Daydreams SDK's generateX402PaymentBrowser only creates a signature (payment commitment)
  // But we need actual USDC transfer, so we do both in one approval:
  // 1. User signs payment commitment (EIP-712) - x402 protocol
  // 2. User approves USDC transfer - actual payment
  // Both happen in wallet with single approval flow
  
  console.log(`💰 Generating x402 payment (single approval):`);
  console.log(`   Amount: ${paymentOption.amount} ${paymentOption.asset}`);
  console.log(`   Network: ${paymentOption.network}`);
  console.log(`   Recipient: ${paymentOption.recipient}`);
  
  // Get USDC contract for balance check and transfer
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
    "function transfer(address to, uint256 amount) returns (bool)",
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
  
  const decimals = typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : Number(decimalsRaw);
  const requiredAmount = BigInt(paymentOption.amount);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
    );
  }

  // Step 1: Generate x402 payment header using Daydreams SDK (EIP-712 signature)
  // This creates the payment commitment - user signs ONCE in wallet
  const signTypedDataAsync = async (data: { domain: any; types: any; message: any }) => {
    return await signer.signTypedData(data.domain, data.types, data.message);
  };
  
  try {
    // Generate payment header with Daydreams SDK (creates EIP-712 signature)
    const paymentHeaderSignature = await generateX402PaymentBrowser(
      walletAddress,
      signTypedDataAsync,
      {
        amount: paymentOption.amount,
        network: paymentOption.network,
      }
    );
    
    if (!paymentHeaderSignature) {
      throw new Error("Failed to generate x402 payment header signature");
    }
    
    console.log(`✅ Payment commitment signed (x402 protocol)`);
    
    // Step 2: Execute USDC transfer (user approves in wallet)
    // This is the actual payment - USDC leaves user's wallet
    const usdcContractWithSigner = new ethers.Contract(usdcAddress, [
      "function transfer(address to, uint256 amount) returns (bool)",
    ], signer);

    console.log(`💸 Executing USDC transfer to server wallet...`);
    const tx = await usdcContractWithSigner.transfer(paymentOption.recipient, requiredAmount);
    console.log(`📝 Transaction sent: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`   💰 ${formatUSDC(requiredAmount, decimals)} USDC transferred to server wallet`);

    // Step 3: Combine payment header (signature) with transaction proof
    // Parse the Daydreams SDK payment header and add transaction hash
    const paymentData = JSON.parse(paymentHeaderSignature);
    paymentData.transactionHash = receipt.hash; // Proof of actual USDC transfer
    paymentData.blockNumber = receipt.blockNumber;
    paymentData.recipient = paymentOption.recipient; // Ensure recipient is set
    
    const finalPaymentHeader = JSON.stringify(paymentData);
    
    console.log(`💰 x402 Payment Header created:`);
    console.log(`   - Payment commitment: Signed ✓`);
    console.log(`   - USDC transfer: ${receipt.hash} ✓`);
    
    return finalPaymentHeader;
  } catch (error: any) {
    console.error("x402 payment generation error:", error);
    throw new Error(`Failed to generate x402 payment: ${error.message}`);
  }
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

