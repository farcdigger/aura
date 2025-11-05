/**
 * x402 Payment Client - Frontend helper for x402 payments
 * Uses Coinbase CDP x402 protocol for payment handling
 * 
 * This handles x402 payments for NFT minting
 * Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
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
 * Generate x402 payment header using Coinbase CDP x402 protocol
 * x402 Protocol: User signs payment commitment (EIP-712) - facilitator executes USDC transfer
 * Single approval: User only signs payment commitment, facilitator handles USDC transfer
 * Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
 * 
 * @param walletAddress - User's wallet address
 * @param signer - ethers signer (from wallet)
 * @param paymentOption - Payment option from 402 response
 * @returns x402-compliant payment header string with payment commitment signature
 */
export async function generateX402PaymentHeader(
  walletAddress: string,
  signer: ethers.Signer,
  paymentOption: X402PaymentRequest
): Promise<string> {
  console.log(`💰 Generating x402 payment using Coinbase CDP x402 protocol:`);
  console.log(`   Amount: ${paymentOption.amount} ${paymentOption.asset}`);
  console.log(`   Network: ${paymentOption.network}`);
  console.log(`   Recipient: ${paymentOption.recipient}`);
  console.log(`   ⚠️ User will sign payment commitment ONCE`);
  console.log(`   ⚠️ Facilitator will execute USDC transfer using the payment commitment`);
  
  // Get USDC contract address for balance check and EIP-712 domain
  const usdcAddress = getUSDCAddress(paymentOption.network);
  if (!usdcAddress) {
    throw new Error(
      `USDC not configured for network: ${paymentOption.network}\n\n` +
      `For Base Mainnet, USDC is automatically configured.\n` +
      `If you're using a testnet, set NEXT_PUBLIC_USDC_CONTRACT_ADDRESS environment variable.`
    );
  }

  const provider = signer.provider;
  if (!provider) {
    throw new Error("Signer does not have a provider. Make sure wallet is connected.");
  }

  // Check USDC balance (optional - just for user info)
  try {
    const usdcContract = new ethers.Contract(usdcAddress, [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ], provider);
    
    const [balance, decimalsRaw] = await Promise.all([
      usdcContract.balanceOf(walletAddress),
      usdcContract.decimals(),
    ]);
    
    const decimals = typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : Number(decimalsRaw);
    const requiredAmount = BigInt(paymentOption.amount);
    
    if (balance < requiredAmount) {
      throw new Error(
        `Insufficient USDC balance. Required: ${formatUSDC(requiredAmount, decimals)}, Available: ${formatUSDC(balance, decimals)}`
      );
    }
    
    console.log(`✅ USDC balance sufficient: ${formatUSDC(balance, decimals)}`);
  } catch (balanceError: any) {
    console.warn(`⚠️ Could not verify USDC balance: ${balanceError.message}`);
  }

  // Generate x402 payment header using Coinbase CDP x402 protocol
  // This creates EIP-712 payment commitment - user signs ONCE in wallet
  // The signature authorizes the facilitator to execute USDC transfer
  // Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
  
  // Determine chain ID from network
  const chainId = paymentOption.network === "base" ? 8453 : 
                  paymentOption.network === "base-sepolia" ? 84532 : 8453;
  
  // Validate and normalize USDC address (must be a valid Ethereum address, not ENS)
  if (!ethers.isAddress(usdcAddress)) {
    throw new Error(`Invalid USDC address: ${usdcAddress}. Must be a valid Ethereum address (0x...).`);
  }
  
  // Normalize USDC address using getAddress() - this prevents ENS resolution
  const normalizedUsdcAddress = ethers.getAddress(usdcAddress);
  
  // EIP-712 domain for x402 payment commitment
  const domain = {
    name: "x402 Payment",
    version: "1",
    chainId: chainId,
    verifyingContract: normalizedUsdcAddress, // Normalized address (no ENS resolution)
  };

  // EIP-712 types for x402 payment (TransferWithAuthorization as priority type)
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

  // Payment message data
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(7);
  
  // Validate and normalize addresses (must be valid Ethereum addresses, not ENS)
  // Use getAddress() to normalize addresses and prevent ENS resolution
  if (!ethers.isAddress(paymentOption.recipient)) {
    throw new Error(`Invalid recipient address: ${paymentOption.recipient}. Must be a valid Ethereum address (0x...).`);
  }
  
  if (!ethers.isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}. Must be a valid Ethereum address (0x...).`);
  }
  
  // Normalize addresses using getAddress() - this prevents ENS resolution
  // getAddress() only works with valid addresses, throws error for ENS names
  const normalizedRecipient = ethers.getAddress(paymentOption.recipient);
  const normalizedPayer = ethers.getAddress(walletAddress);
  
  // Normalize asset: if it's a contract address, use "USDC" string instead
  // Middleware may expect "USDC" string rather than contract address
  const assetString = paymentOption.asset === normalizedUsdcAddress || 
                     paymentOption.asset === usdcAddress ||
                     (paymentOption.asset.startsWith("0x") && paymentOption.asset.length === 42)
                     ? "USDC" 
                     : paymentOption.asset;
  
  const message = {
    amount: paymentOption.amount,
    asset: assetString, // Use "USDC" string instead of contract address
    network: paymentOption.network,
    recipient: normalizedRecipient, // Normalized address (no ENS resolution)
    payer: normalizedPayer, // Normalized address (no ENS resolution)
    timestamp: timestamp,
    nonce: nonce,
  };
  
  console.log(`📋 Payment message:`, {
    amount: message.amount,
    asset: message.asset,
    network: message.network,
    recipient: message.recipient,
    payer: message.payer,
    timestamp: message.timestamp,
    nonce: message.nonce,
  });

  // Sign EIP-712 payment commitment
  console.log(`📝 Signing payment commitment (EIP-712)...`);
  const signature = await signer.signTypedData(domain, types, message);
  
  // Create x402 payment header (Coinbase CDP format)
  const paymentData = {
    ...message,
    signature,
  };
  
  const paymentHeader = JSON.stringify(paymentData);
  
  console.log(`✅ x402 Payment Header created (Coinbase CDP x402 protocol)`);
  console.log(`   User signed payment commitment - facilitator will execute USDC transfer`);
  console.log(`   ⚠️ NO separate USDC transfer transaction - facilitator handles it`);
  
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

