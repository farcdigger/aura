import axios from "axios";
import { env } from "../env.mjs";

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

export interface X402PaymentVerification {
  paymentId: string;
  amount: string;
  asset: string;
  network: string;
  payer: string;
  recipient: string;
}

/**
 * Create x402 payment response for mint payment
 * Note: This is separate from Daydreams SDK's x402 payment (used for image generation)
 * This payment is for the NFT mint itself
 */
export function createX402Response(recipient: string): X402PaymentResponse {
  // Determine network from chain ID
  const chainId = parseInt(env.NEXT_PUBLIC_CHAIN_ID || "8453");
  let network = "base"; // Base Mainnet
  
  // Base Mainnet (default)
  if (chainId === 8453) {
    network = "base";
  } else if (chainId === 84532) {
    // Base Sepolia testnet (legacy support)
    network = "base-sepolia";
  }
  
  return {
    x402Version: 1,
    accepts: [
      {
        asset: "USDC",
        amount: env.X402_PRICE_USDC,
        network,
        recipient,
      },
    ],
    error: "",
  };
}

/**
 * @deprecated REMOVED: verifyX402Payment() function has been removed.
 * 
 * Payment verification is now handled AUTOMATICALLY by x402-next middleware (middleware.ts).
 * The middleware automatically:
 * 1. Verifies payment signature via facilitator
 * 2. Facilitator executes USDC transfer automatically  
 * 3. Only allows request to proceed if payment is valid
 * 
 * DO NOT implement manual payment verification - middleware handles everything!
 * See middleware.ts for the correct implementation.
 * 
 * This function body has been removed to prevent accidental usage.
 * If you need payment verification, use x402-next middleware instead.
 */
export async function verifyX402Payment(
  _paymentHeader: string,
  _facilitatorUrl?: string,
  _rpcUrl?: string
): Promise<X402PaymentVerification | null> {
  throw new Error(
    "verifyX402Payment() has been removed. " +
    "Payment verification is handled automatically by x402-next middleware. " +
    "See middleware.ts for the correct implementation."
  );
  
  /* REMOVED: Original implementation removed because middleware handles everything automatically.
  try {
    // Parse X-PAYMENT header (contains payment commitment with EIP-712 signature)
    // x402 Protocol: Signature is payment authorization - server executes USDC transfer
    // NO separate transaction hash needed - signature authorizes the transfer
    const paymentData = JSON.parse(paymentHeader);
    
    // Verify payment header has required data
    if (!paymentData.payer || !paymentData.amount || !paymentData.recipient) {
      console.error("Invalid payment header: missing payment data");
      return null;
    }
    
    // Verify EIP-712 signature is present (payment commitment/authorization)
    if (!paymentData.signature) {
      console.error("Invalid payment header: missing EIP-712 signature (payment authorization)");
      return null;
    }

    // Verify EIP-712 signature
    // The signature proves the user committed to pay the specified amount
    // IMPORTANT: Use network from payment data, not environment variable
    // This ensures client and server use the same network and USDC address
    // Middleware expects "base" format, not "base-mainnet"
    const network = paymentData.network || "base";
    
    // Determine chain ID from network (must match client-side)
    const chainId = network === "base" ? 8453 : 
                    network === "base-sepolia" ? 84532 : 8453;
    
    // Get USDC address for network (must match client-side)
    const usdcAddress = network === "base"
      ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // Base Mainnet USDC
      : network === "base-sepolia"
      ? (process.env.USDC_CONTRACT_ADDRESS || null) // Base Sepolia (testnet)
      : null;
    
    if (!usdcAddress) {
      console.error(`USDC contract address not configured for network: ${network}`);
      return null;
    }
    
    console.log(`🔍 Payment verification - Network: ${network}, Chain ID: ${chainId}, USDC: ${usdcAddress}`);

    try {
      const { ethers } = await import("ethers");
      
      // Verify EIP-712 signature
      // This is the x402 payment commitment - the signature proves the payment
      // IMPORTANT: Domain name must match exactly with client-side (case-sensitive!)
      const domain = {
        name: "x402 Payment", // Must match client-side domain name exactly
        version: "1",
        chainId: network === "base" ? 8453 : network === "base-sepolia" ? 84532 : 8453,
        verifyingContract: usdcAddress,
      };

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

      // Verify signature matches payer
      // IMPORTANT: Ensure all data types match exactly with client-side signing
      const message = {
        amount: paymentData.amount,
        asset: paymentData.asset,
        network: paymentData.network,
        recipient: paymentData.recipient,
        payer: paymentData.payer,
        timestamp: BigInt(paymentData.timestamp), // Convert to BigInt for uint256
        nonce: paymentData.nonce,
      };
      
      console.log("🔍 Verifying EIP-712 signature:");
      console.log(`   Domain: ${domain.name} (v${domain.version})`);
      console.log(`   Chain ID: ${domain.chainId}`);
      console.log(`   Verifying Contract: ${domain.verifyingContract}`);
      console.log(`   Payer: ${message.payer}`);
      console.log(`   Recipient: ${message.recipient}`);
      console.log(`   Amount: ${message.amount}`);
      console.log(`   Timestamp: ${message.timestamp}`);
      
      const recoveredAddress = ethers.verifyTypedData(
        domain,
        types,
        message,
        paymentData.signature
      );

      console.log(`   Recovered Address: ${recoveredAddress}`);
      console.log(`   Expected Payer: ${paymentData.payer}`);
      
      if (recoveredAddress.toLowerCase() !== paymentData.payer.toLowerCase()) {
        console.error("❌ Signature verification failed: address mismatch");
        console.error(`   Recovered: ${recoveredAddress.toLowerCase()}`);
        console.error(`   Expected: ${paymentData.payer.toLowerCase()}`);
        return null;
      }
      
      console.log("✅ Signature verification successful!");

      // Verify payment amount matches expected
      const expectedAmount = process.env.X402_PRICE_USDC || "100000";
      if (paymentData.amount !== expectedAmount) {
        console.error(`Payment amount mismatch: expected ${expectedAmount}, got ${paymentData.amount}`);
        return null;
      }

      // Verify payment is not too old (5 minutes)
      const timestamp = Number(paymentData.timestamp || 0);
      const now = Math.floor(Date.now() / 1000);
      if (timestamp > 0 && now - timestamp > 300) {
        console.error("Payment commitment expired");
        return null;
      }

      // x402 Protocol: Signature verifies payment commitment
      // The signature authorizes the payment - USDC transfer is authorized
      // In production, this would be executed via facilitator contract or permit pattern
      // For now, we verify the signature and accept it as payment authorization
      
      // Format USDC amount for display
      const amountBigInt = BigInt(paymentData.amount);
      const usdcDecimals = 6; // USDC has 6 decimals
      const divisor = BigInt(10 ** usdcDecimals);
      const whole = amountBigInt / divisor;
      const fraction = amountBigInt % divisor;
      const formattedAmount = `${whole}.${fraction.toString().padStart(usdcDecimals, "0")}`;
      
      console.log("✅ x402 payment verified (signature authorization):");
      console.log(`   - Payment commitment: EIP-712 signature verified ✓`);
      console.log(`   - Payment authorized: Signature proves user committed to pay ✓`);
      console.log(`   Payer: ${paymentData.payer}`);
      console.log(`   Amount: ${formattedAmount} USDC`);
      console.log(`   Recipient: ${paymentData.recipient}`);
      console.log(`   ⚠️ Payment commitment verified - signature IS the payment authorization`);
      
      // x402 Protocol: EIP-712 signature is the payment authorization
      // IMPORTANT: For production USDC transfer, integrate CDP facilitator as MIDDLEWARE
      // 
      // Coinbase x402 facilitator works as middleware, not as manual API:
      // - Install: npm install x402-next @coinbase/x402
      // - Use: import { paymentMiddleware, facilitator } from "x402-next"
      // - See: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers#running-on-mainnet
      //
      // For now, we accept the EIP-712 signature as proof of payment authorization.
      // The signature proves the user committed to pay 2 USDC.
      // In production with CDP middleware, USDC transfer happens automatically.
      
      console.log(`✅ x402 payment authorization verified via EIP-712 signature`);
      console.log(`   Signature authorizes payment of ${formattedAmount} USDC`);
      console.log(`   From: ${paymentData.payer} → To: ${paymentData.recipient}`);
      
      // Execute USDC transfer via facilitator
      // For CDP facilitator (mainnet), use @coinbase/x402 package
      // For testnet facilitator, use facilitator URL
      try {
        if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
          // CDP facilitator (mainnet) - use @coinbase/x402 package
          // Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
          console.log(`🔗 Executing payment via CDP facilitator...`);
          console.log(`   Recipient: ${paymentData.recipient}`);
          console.log(`   Amount: ${formattedAmount} USDC`);
          console.log(`   Network: ${paymentData.network || "base"}`);
          
          try {
            // Use @coinbase/x402 facilitator to execute payment
            // The facilitator is configured via CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables
            // Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
            const { facilitator } = await import("@coinbase/x402");
            
            console.log(`📡 Executing payment via CDP facilitator...`);
            console.log(`   Payment header: ${paymentHeader.substring(0, 100)}...`);
            console.log(`   Payer: ${paymentData.payer}`);
            console.log(`   Recipient: ${paymentData.recipient}`);
            console.log(`   Amount: ${formattedAmount} USDC`);
            console.log(`   Network: ${paymentData.network || "base"}`);
            
            // Parse payment header to get payment data
            const paymentPayload = JSON.parse(paymentHeader);
            
            // Use facilitator to execute payment
            // The facilitator from @coinbase/x402 should have methods to execute payments
            // Try to find executePayment, processPayment, or similar method
            if (facilitator && typeof facilitator === 'object') {
              // Check if facilitator has executePayment method
              if (typeof (facilitator as any).executePayment === 'function') {
                console.log(`📡 Calling facilitator.executePayment()...`);
                const result = await (facilitator as any).executePayment(paymentHeader, {
                  network: paymentData.network || "base",
                  recipient: paymentData.recipient,
                  amount: paymentData.amount,
                  asset: paymentData.asset || "USDC",
                });
                
                if (result?.transactionHash) {
                  console.log(`✅ CDP Facilitator executed USDC transfer!`);
                  console.log(`   Transaction hash: ${result.transactionHash}`);
                  console.log(`   Transfer: ${paymentData.payer} → ${paymentData.recipient} (${formattedAmount} USDC)`);
                } else {
                  console.log(`✅ CDP Facilitator response: ${JSON.stringify(result)}`);
                }
              } else if (typeof (facilitator as any).processPayment === 'function') {
                console.log(`📡 Calling facilitator.processPayment()...`);
                const result = await (facilitator as any).processPayment(paymentHeader, {
                  network: paymentData.network || "base",
                  recipient: paymentData.recipient,
                  amount: paymentData.amount,
                  asset: paymentData.asset || "USDC",
                });
                
                if (result?.transactionHash) {
                  console.log(`✅ CDP Facilitator executed USDC transfer!`);
                  console.log(`   Transaction hash: ${result.transactionHash}`);
                } else {
                  console.log(`✅ CDP Facilitator response: ${JSON.stringify(result)}`);
                }
              } else {
                // Facilitator doesn't have executePayment method
                // Try CDP Facilitator REST API endpoint
                console.log(`⚠️ Facilitator object doesn't have executePayment/processPayment methods`);
                console.log(`   Trying CDP Facilitator REST API endpoint...`);
                
                const cdpApiKeyId = process.env.CDP_API_KEY_ID;
                const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
                
                if (!cdpApiKeyId || !cdpApiKeySecret) {
                  console.warn(`⚠️ CDP_API_KEY_ID or CDP_API_KEY_SECRET not set`);
                  throw new Error("CDP API keys not configured");
                }
                
                // Try CDP Facilitator REST API endpoint
                // Based on x402 protocol, facilitator should accept payment header
                const cdpFacilitatorUrl = "https://api.cdp.coinbase.com/x402/v1/payments";
                
                try {
                  const facilitatorResponse = await axios.post(
                    cdpFacilitatorUrl,
                    {
                      payment: paymentHeader, // Full payment header with EIP-712 signature
                      network: paymentData.network || "base",
                      recipient: paymentData.recipient,
                      amount: paymentData.amount,
                      asset: paymentData.asset || "USDC",
                    },
                    {
                      headers: {
                        "Content-Type": "application/json",
                        "X-CDP-API-KEY-ID": cdpApiKeyId,
                        "X-CDP-API-KEY-SECRET": cdpApiKeySecret,
                      },
                      auth: {
                        username: cdpApiKeyId,
                        password: cdpApiKeySecret,
                      },
                      timeout: 15000, // 15 second timeout
                    }
                  );
                  
                  if (facilitatorResponse.data?.transactionHash || facilitatorResponse.status === 200 || facilitatorResponse.status === 202) {
                    console.log(`✅ CDP Facilitator executed USDC transfer!`);
                    if (facilitatorResponse.data?.transactionHash) {
                      console.log(`   Transaction hash: ${facilitatorResponse.data.transactionHash}`);
                    }
                    console.log(`   Transfer: ${paymentData.payer} → ${paymentData.recipient} (${formattedAmount} USDC)`);
                    console.log(`   Response: ${JSON.stringify(facilitatorResponse.data)}`);
                  } else {
                    console.warn(`⚠️ CDP Facilitator response: ${JSON.stringify(facilitatorResponse.data)}`);
                    console.warn(`   Status: ${facilitatorResponse.status}`);
                  }
                } catch (apiError: any) {
                  console.error(`❌ CDP Facilitator API error: ${apiError.message}`);
                  console.error(`   Response: ${apiError.response?.data || 'No response data'}`);
                  console.error(`   Status: ${apiError.response?.status || 'Unknown'}`);
                  throw apiError;
                }
              }
            } else {
              console.warn(`⚠️ Facilitator is not an object or is null`);
              console.warn(`   CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set in environment variables`);
            }
            
          } catch (cdpError: any) {
            console.error(`❌ CDP Facilitator error: ${cdpError.message}`);
            console.error(`   Stack: ${cdpError.stack}`);
            // Don't fail - signature is verified, facilitator might have issues
            console.warn(`⚠️ Continuing with signature verification only`);
            console.warn(`   Note: Facilitator may process payment asynchronously`);
          }
        } else if (facilitatorUrl) {
          // Testnet facilitator (e.g., https://x402.org/facilitator)
          console.log(`🔗 Executing payment via testnet facilitator: ${facilitatorUrl}`);
          
          // Testnet facilitator endpoint - try without /execute first
          // The facilitator should accept payment header directly
          try {
            const facilitatorResponse = await axios.post(
              facilitatorUrl, // Direct POST to facilitator URL (no /execute endpoint)
              {
                payment: paymentHeader, // Send full payment header with signature
                network: paymentData.network || "base",
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  "X-PAYMENT": paymentHeader, // Also send as header
                },
              }
            );
            
            if (facilitatorResponse.data?.transactionHash) {
              console.log(`✅ Testnet facilitator executed USDC transfer!`);
              console.log(`   Transaction hash: ${facilitatorResponse.data.transactionHash}`);
              console.log(`   Transfer: ${paymentData.payer} → ${paymentData.recipient} (${formattedAmount} USDC)`);
            } else {
              console.warn(`⚠️ Testnet facilitator response: ${JSON.stringify(facilitatorResponse.data)}`);
              console.warn(`   Payment may still be processed asynchronously`);
            }
          } catch (testnetError: any) {
            console.error(`❌ Testnet facilitator error: ${testnetError.message}`);
            console.error(`   Response: ${testnetError.response?.data || 'No response data'}`);
            console.error(`   Status: ${testnetError.response?.status || 'Unknown'}`);
            console.warn(`⚠️ Testnet facilitator may not support direct API calls`);
            console.warn(`   Payment signature is verified, but transfer may not execute on testnet`);
          }
        } else {
          console.warn(`⚠️ No facilitator configured - payment signature verified but transfer not executed`);
          console.warn(`   Set X402_FACILITATOR_URL for testnet or CDP_API_KEY_ID/CDP_API_KEY_SECRET for mainnet`);
        }
      } catch (facilitatorError: any) {
        console.error(`❌ Facilitator execution error: ${facilitatorError.message}`);
        // Don't fail payment verification if facilitator fails
        // Signature is cryptographically verified, which is sufficient
        console.warn(`⚠️ Continuing with signature verification only`);
      }
      
      console.log(`   ✅ Payment commitment is cryptographically verified`);
      console.log(`   📖 Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers`);
      
      return {
        paymentId: paymentData.nonce || `payment_${timestamp}`,
        amount: paymentData.amount,
        asset: paymentData.asset,
        network: paymentData.network || "base",
        payer: paymentData.payer,
        recipient: paymentData.recipient,
      };
    } catch (sigError: any) {
      console.error("EIP-712 signature verification error:", sigError.message);
      return null;
    }
    } catch (error: any) {
    console.error("x402 verification error:", error.message);
    return null;
  }
  */
}

