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
 * Execute x402 payment using Daydreams Router facilitator
 * This follows the x402 protocol: payment is made through a facilitator
 * Reference: https://docs.daydreams.systems/docs/router
 * 
 * @param paymentRequest - The 402 payment request from server
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

  // x402 Payment via Daydreams Router facilitator
  // Instead of direct USDC transfer, we use the x402 facilitator
  // This ensures proper payment tracking and verification
  const facilitatorUrl = process.env.NEXT_PUBLIC_X402_FACILITATOR_URL || "https://router.daydreams.systems";
  
  console.log(`💳 Using x402 facilitator: ${facilitatorUrl}`);
  console.log(`💰 Payment required: ${paymentOption.amount} ${paymentOption.asset} on ${paymentOption.network}`);

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
  let decimalsRaw: bigint | number;
  
  try {
    balance = await usdcContract.balanceOf(walletAddress);
    decimalsRaw = await usdcContract.decimals();
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
  
  // Ensure decimals is always a number (ethers.js might return BigInt)
  const decimals = typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : Number(decimalsRaw);
  if (isNaN(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid decimals value from contract: ${decimalsRaw}`);
  }
  
  const requiredAmount = BigInt(paymentOption.amount);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
    );
  }

  // Execute x402 payment through facilitator
  // Step 1: Request payment from facilitator
  try {
    const facilitatorResponse = await fetch(`${facilitatorUrl}/payment/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentRequest: paymentOption,
        payer: walletAddress,
      }),
    });

    if (!facilitatorResponse.ok) {
      throw new Error(`Facilitator payment initiation failed: ${facilitatorResponse.statusText}`);
    }

    const facilitatorData = await facilitatorResponse.json();
    console.log(`💳 Payment initiated with facilitator: ${facilitatorData.paymentId}`);
    
    // Step 2: Execute USDC transfer to facilitator's payment address
    // The facilitator will forward the payment to the recipient
    const facilitatorPaymentAddress = facilitatorData.paymentAddress || paymentOption.recipient;
    
    console.log(`💸 Transferring ${formatUSDC(requiredAmount, decimals)} USDC to facilitator`);
    const tx = await usdcContract.transfer(facilitatorPaymentAddress, requiredAmount);
    console.log(`📝 Transaction sent: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Step 3: Notify facilitator of payment completion
    const confirmResponse = await fetch(`${facilitatorUrl}/payment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: facilitatorData.paymentId,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      }),
    });

    if (!confirmResponse.ok) {
      console.warn(`⚠️ Facilitator confirmation failed, but payment was successful`);
    }

    // Create payment proof (x402 format)
    const proof: X402PaymentProof = {
      paymentId: facilitatorData.paymentId || `payment_${receipt.blockNumber}_${tx.hash.substring(2, 10)}`,
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
  } catch (facilitatorError: any) {
    // Fallback: If facilitator is unavailable, use direct transfer
    console.warn(`⚠️ Facilitator unavailable, using direct transfer: ${facilitatorError.message}`);
    
    console.log(`💸 Transferring ${formatUSDC(requiredAmount, decimals)} USDC directly to ${paymentOption.recipient}`);
    const tx = await usdcContract.transfer(paymentOption.recipient, requiredAmount);
    console.log(`📝 Transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

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

