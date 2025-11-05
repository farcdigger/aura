/**
 * Coinbase CDP x402 Facilitator Integration
 * Handles USDC transfer execution for x402 payments
 * Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers#running-on-mainnet
 */

import { env } from "../env.mjs";

let facilitatorInstance: any = null;

/**
 * Get Coinbase CDP facilitator instance
 * Requires CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables
 */
export async function getCDPFacilitator() {
  // Return cached instance if available
  if (facilitatorInstance) {
    return facilitatorInstance;
  }

  // Check if CDP API keys are configured
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
    console.warn("⚠️ CDP API keys not configured - x402 payments will use signature verification only");
    console.warn("   For production USDC transfer, set CDP_API_KEY_ID and CDP_API_KEY_SECRET");
    console.warn("   Get keys at: https://cdp.coinbase.com");
    return null;
  }

  try {
    // Dynamically import Coinbase x402 SDK (only when needed)
    const { facilitator } = await import("@coinbase/x402");
    
    console.log("✅ Coinbase CDP facilitator initialized");
    console.log("   CDP API Key ID:", env.CDP_API_KEY_ID.substring(0, 10) + "...");
    
    facilitatorInstance = facilitator;
    return facilitatorInstance;
  } catch (error: any) {
    console.error("❌ Failed to initialize CDP facilitator:", error.message);
    console.error("   Make sure @coinbase/x402 is installed: npm install @coinbase/x402");
    return null;
  }
}

/**
 * Execute USDC transfer using CDP facilitator
 * 
 * @param paymentHeader - x402 payment header with EIP-712 signature
 * @param network - Network name (e.g., "base", "base-sepolia")
 * @param amount - USDC amount in smallest unit (e.g., 2000000 = 2 USDC)
 * @param payer - Payer's wallet address
 * @param recipient - Recipient's wallet address
 * @returns Transaction hash if successful, null otherwise
 */
export async function executeFacilitatorTransfer(
  paymentHeader: string,
  network: string,
  amount: string,
  payer: string,
  recipient: string
): Promise<string | null> {
  const facilitator = await getCDPFacilitator();
  
  if (!facilitator) {
    console.warn("⚠️ CDP facilitator not available - USDC transfer not executed");
    console.warn("   Payment signature is verified, but actual USDC transfer requires CDP facilitator");
    return null;
  }

  try {
    console.log("📤 Executing USDC transfer via CDP facilitator...");
    console.log(`   Network: ${network}`);
    console.log(`   Amount: ${amount} (smallest unit)`);
    console.log(`   From: ${payer}`);
    console.log(`   To: ${recipient}`);

    // Parse payment header
    const paymentData = JSON.parse(paymentHeader);
    
    // Execute transfer via CDP facilitator
    // The facilitator will:
    // 1. Verify the EIP-712 signature
    // 2. Execute USDC transfer on-chain
    // 3. Return transaction hash
    const result = await facilitator.executePayment({
      paymentData,
      network,
    });

    if (result && result.transactionHash) {
      console.log("✅ CDP facilitator executed USDC transfer successfully");
      console.log(`   Transaction hash: ${result.transactionHash}`);
      return result.transactionHash;
    }

    console.warn("⚠️ CDP facilitator returned no transaction hash");
    return null;
  } catch (error: any) {
    console.error("❌ CDP facilitator transfer failed:", error.message);
    console.error("   This might be due to:");
    console.error("   - Insufficient USDC balance");
    console.error("   - Invalid signature");
    console.error("   - Network issues");
    console.error("   - CDP API key issues");
    return null;
  }
}

/**
 * Check if CDP facilitator is available
 */
export function isFacilitatorAvailable(): boolean {
  return !!(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET);
}

