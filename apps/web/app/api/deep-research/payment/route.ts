/**
 * x402 Payment endpoint for Deep Research
 * Pricing: $0.20 (NFT holders) vs $1.50 (standard)
 * 
 * Flow:
 * 1. Check NFT ownership (for pricing)
 * 2. Return 402 with payment requirements
 * 3. x402-fetch handles payment on client
 * 4. CDP Facilitator settles USDC payment
 * 5. Queue analysis job
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

const RECIPIENT_ADDRESS = "0xDA9097c5672928a16C42889cD4b07d9a766827ee"; // Same as other payments
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = "base";

// Trial pricing period (4 days: Dec 14-17, 2025)
const TRIAL_PRICING_START = new Date("2025-12-14T00:00:00Z");
const TRIAL_PRICING_END = new Date("2025-12-18T00:00:00Z");
const TRIAL_PRICE = "1000"; // $0.001 USDC (tests payment system)

// Regular pricing (USDC with 6 decimals)
const PRICE_WITH_NFT = "200000";    // $0.20 USDC
const PRICE_WITHOUT_NFT = "1500000"; // $1.50 USDC

/**
 * Check if we're in trial pricing period
 */
function isTrialPricing(): boolean {
  const now = new Date();
  return now >= TRIAL_PRICING_START && now < TRIAL_PRICING_END;
}

// x402 payment requirements
function createPaymentRequirements(amount: string, hasNFT: boolean) {
  const priceUSD = parseFloat(amount) / 1_000_000;
  const description = hasNFT
    ? `Deep Research Analysis (NFT Holder) - ${priceUSD} USDC`
    : `Deep Research Analysis - ${priceUSD} USDC`;

  return {
    scheme: "exact" as const,
    network: NETWORK,
    maxAmountRequired: amount,
    resource: "https://xfroranft.xyz/api/deep-research/payment",
    description,
    mimeType: "application/json",
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: BASE_USDC_ADDRESS,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  };
}

/**
 * Check NFT ownership (for pricing)
 */
async function checkNFTOwnership(walletAddress: string): Promise<boolean> {
  try {
    if (!ethers.isAddress(walletAddress)) {
      return false;
    }

    const normalizedAddress = ethers.getAddress(walletAddress);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      ["function balanceOf(address owner) external view returns (uint256)"],
      provider
    );

    const balance = await contract.balanceOf(normalizedAddress);
    return balance > 0n;
  } catch (error: any) {
    console.error("Error checking NFT ownership:", error.message);
    return false;
  }
}

/**
 * GET - Return 402 Payment Required
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get("walletAddress");

  if (!walletAddress) {
    return NextResponse.json(
      { error: "walletAddress is required" },
      { status: 400 }
    );
  }

  // Normalize wallet address to lowercase for consistent handling
  // Ethereum addresses can be in checksum format (mixed case) or lowercase
  const normalizedWalletAddress = walletAddress.toLowerCase();

  // Determine pricing based on trial period and NFT ownership
  let paymentAmount: string;
  let hasNFT = false;
  
  if (isTrialPricing()) {
    // Trial pricing: $0.001 USDC (no NFT discount)
    paymentAmount = TRIAL_PRICE;
  } else {
    // Normal pricing: Check NFT ownership
    hasNFT = await checkNFTOwnership(walletAddress);
    paymentAmount = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
  }
  
  const paymentRequirements = createPaymentRequirements(paymentAmount, hasNFT);

  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [paymentRequirements],
      hasNFT,
      priceUSD: parseFloat(paymentAmount) / 1_000_000,
    },
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true",
      },
    }
  );
}

/**
 * POST - Process payment and start analysis
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentHeader = request.headers.get("X-PAYMENT");

    // Get request body
    let body: any = null;
    try {
      const clonedRequest = request.clone();
      body = await clonedRequest.json();
    } catch (e) {
      // Body parsing failed
    }

    if (!body) {
      return NextResponse.json(
        { error: "Request body is required" },
        { status: 400 }
      );
    }

    const { tokenMint, walletAddress, network = 'solana' } = body;

    if (!tokenMint || !walletAddress) {
      return NextResponse.json(
        { error: "tokenMint and walletAddress are required" },
        { status: 400 }
      );
    }

    // Network-aware address validation
    if (network === 'solana') {
      // Solana: Base58 format, 32-44 chars, NOT starting with 0x
      if (tokenMint.startsWith("0x") || tokenMint.startsWith("0X")) {
        return NextResponse.json(
          { 
            error: "Invalid address format",
            message: "Invalid Solana address format. Solana addresses do not start with 0x. Please enter a valid Solana token address."
          },
          { status: 400 }
        );
      }
      if (tokenMint.length < 32 || tokenMint.length > 44) {
        return NextResponse.json(
          { 
            error: "Invalid Solana address format",
            message: "Invalid Solana address format. Solana addresses are 32-44 characters long. Please enter a valid Solana token address."
          },
          { status: 400 }
        );
      }
    } else if (network === 'base' || network === 'bsc') {
      // EVM (Base/BSC): Hex format, 0x + 40 hex characters (42 total)
      if (!tokenMint.startsWith("0x") && !tokenMint.startsWith("0X")) {
        return NextResponse.json(
          { 
            error: "Invalid address format",
            message: `Invalid ${network === 'base' ? 'Base' : 'BSC'} address format. ${network === 'base' ? 'Base' : 'BSC'} addresses start with 0x. Please enter a valid token address.`
          },
          { status: 400 }
        );
      }
      if (tokenMint.length !== 42) {
        return NextResponse.json(
          { 
            error: "Invalid address format",
            message: `Invalid ${network === 'base' ? 'Base' : 'BSC'} address format. ${network === 'base' ? 'Base' : 'BSC'} addresses are 42 characters long (0x + 40 hex characters). Please enter a valid token address.`
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { 
          error: "Invalid network",
          message: `Invalid network: ${network}. Supported networks: solana, base, bsc.`
        },
        { status: 400 }
      );
    }

    // Normalize wallet address to lowercase for consistent storage
    // Ethereum addresses can be in checksum format (mixed case) or lowercase
    const normalizedWalletAddress = walletAddress.toLowerCase();

    // Check for free ticket first
    let hasFreeTicket = false;
    try {
      const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
      const ticketResponse = await fetch(`${agentUrl}/api/free-ticket?userWallet=${encodeURIComponent(normalizedWalletAddress)}`);
      if (ticketResponse.ok) {
        const ticketData = await ticketResponse.json();
        hasFreeTicket = ticketData.hasTicket || false;
        if (hasFreeTicket) {
          console.log(`✅ Free ticket found for ${normalizedWalletAddress.substring(0, 10)}... - skipping payment`);
        }
      }
    } catch (ticketError: any) {
      console.warn("⚠️ Error checking free ticket:", ticketError.message);
    }

    // If no payment header, return 402 with payment requirements
    if (!paymentHeader) {
      let paymentAmount: string;
      let hasNFT = false;
      
      // If user has free ticket, charge 0.001 USDC (1000 in 6 decimals)
      if (hasFreeTicket) {
        paymentAmount = TRIAL_PRICE; // $0.001 USDC (1000 microUSDC) for free ticket
        hasNFT = false; // Not relevant for free ticket
      } else if (isTrialPricing()) {
        // Trial pricing: $0.001 USDC
        paymentAmount = TRIAL_PRICE;
      } else {
        // Normal pricing: Check NFT ownership
        hasNFT = await checkNFTOwnership(walletAddress);
        paymentAmount = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
      }
      
      const paymentRequirements = createPaymentRequirements(paymentAmount, hasNFT);

      console.log(`💳 Returning 402 for Deep Research: ${parseFloat(paymentAmount) / 1_000_000} USDC (Trial: ${isTrialPricing()}, NFT: ${hasNFT})`);

      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [paymentRequirements],
        },
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Required": "true",
          },
        }
      );
    }

    // Parse payment payload
    let paymentPayload;
    try {
      if (paymentHeader.startsWith("eyJ")) {
        const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
        paymentPayload = JSON.parse(decoded);
      } else {
        paymentPayload = JSON.parse(paymentHeader);
      }
      console.log("✅ Payment payload parsed");
    } catch (error) {
      console.error("❌ Invalid payment header format:", error);
      return NextResponse.json({ error: "Invalid payment header" }, { status: 400 });
    }

    // Determine payment amount based on free ticket, trial period, and NFT ownership
    let paymentAmountUSDC: string;
    let hasNFT = false;
    
    // Check for free ticket again (in case it was issued after initial check)
    if (hasFreeTicket) {
      // Free ticket: charge 0.001 USDC (1000 microUSDC)
      paymentAmountUSDC = TRIAL_PRICE;
      hasNFT = false; // Not relevant for free ticket
    } else if (isTrialPricing()) {
      // Trial pricing: $0.001 USDC
      paymentAmountUSDC = TRIAL_PRICE;
    } else {
      // Normal pricing: Check NFT ownership
      hasNFT = await checkNFTOwnership(walletAddress);
      paymentAmountUSDC = hasNFT ? PRICE_WITH_NFT : PRICE_WITHOUT_NFT;
    }
    
    const paymentRequirements = createPaymentRequirements(paymentAmountUSDC, hasNFT);

    // Settle payment with CDP Facilitator (USDC transfer)
    console.log("💰 Settling payment with CDP Facilitator...");
    const settlement = await settlePaymentWithCDPFacilitator(paymentPayload, paymentRequirements);

    if (!settlement.success) {
      console.error("❌ Payment settlement failed:", settlement.errorReason);
      return NextResponse.json(
        {
          error: "Payment settlement failed",
          reason: settlement.errorReason,
        },
        { status: 402 }
      );
    }

    console.log("✅ Payment settled successfully!");
    console.log(`   Payer: ${settlement.payer}`);
    console.log(`   Transaction: ${settlement.transaction}`);

    const payer = settlement.payer || paymentPayload.payload?.authorization?.from;
    if (!payer) {
      return NextResponse.json({ error: "Could not determine payer address" }, { status: 400 });
    }

    // Check queue status BEFORE payment (to avoid charging for unavailable service)
    console.log("📊 Checking queue status before payment...");
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    
    // Check queue capacity first
    try {
      const queueStatsResponse = await fetch(`${agentUrl}/stats`);
      if (queueStatsResponse.ok) {
        const queueStats = await queueStatsResponse.json();
        const totalInQueue = (queueStats.waiting || 0) + (queueStats.active || 0);
        const MAX_QUEUE_SIZE = 4; // 4 active, no waiting queue
        
        if (totalInQueue >= MAX_QUEUE_SIZE) {
          console.warn(`⚠️ Queue is full: ${totalInQueue}/${MAX_QUEUE_SIZE} (active: ${queueStats.active}, waiting: ${queueStats.waiting})`);
          
          // Issue free ticket before returning error
          try {
            await fetch(`${agentUrl}/api/free-ticket`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userWallet: normalizedWalletAddress,
                reason: "queue_full_before_payment",
                metadata: {
                  tokenMint,
                  timestamp: new Date().toISOString(),
                  source: "queue_full_error",
                  queueStats: {
                    active: queueStats.active || 0,
                    waiting: queueStats.waiting || 0,
                    total: totalInQueue,
                  },
                },
              }),
            });
            console.log("✅ Free ticket issued due to queue being full");
          } catch (ticketError: any) {
            console.error("❌ Error issuing free ticket:", ticketError.message);
          }
          
          return NextResponse.json(
            {
              error: "Queue is full",
              message: `Currently ${queueStats.active || 0} analyses are running simultaneously and our limits are full. Your analysis has failed, but don't worry! A 0.001 USDC analysis ticket has been granted to you. You can generate an analysis at a very low cost.`,
              freeTicket: true,
              queueInfo: {
                active: queueStats.active || 0,
                waiting: queueStats.waiting || 0,
                total: totalInQueue,
                maxSize: MAX_QUEUE_SIZE,
              },
            },
            { status: 429 } // Too Many Requests
          );
        }
        console.log(`✅ Queue has capacity: ${totalInQueue}/${MAX_QUEUE_SIZE} (active: ${queueStats.active}, waiting: ${queueStats.waiting})`);
      }
    } catch (queueError: any) {
      console.warn("⚠️ Error checking queue status:", queueError.message);
      // Continue anyway - queue check is not critical, but we prefer to check
    }
    
    // Check weekly limit and queue status BEFORE queuing (to avoid charging for unavailable service)
    console.log("📊 Checking weekly limit...");
    
    let limitData: any = null;
    try {
      const limitResponse = await fetch(`${agentUrl}/api/weekly-limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: walletAddress }),
      });

      if (limitResponse.ok) {
        limitData = await limitResponse.json();
        if (!limitData.allowed || limitData.remaining <= 0) {
          // Weekly limit reached AFTER payment - issue free ticket
          console.warn("⚠️ Weekly limit reached after payment - issuing free ticket");
          
          // Issue free ticket via agent API
          try {
            await fetch(`${agentUrl}/api/free-ticket`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userWallet: normalizedWalletAddress,
                reason: "weekly_limit_reached_after_payment",
                metadata: {
                  transactionHash: settlement.transaction,
                  tokenMint,
                  timestamp: new Date().toISOString(),
                },
              }),
            });
          } catch (ticketError) {
            console.error("❌ Failed to issue free ticket:", ticketError);
          }
          
          return NextResponse.json(
            {
              error: "Weekly limit reached",
              limitInfo: {
                current: limitData.current,
                limit: limitData.limit,
                remaining: 0,
              },
              freeTicket: true,
              freeTicketReason: "weekly_limit_reached_after_payment",
              transaction: settlement.transaction,
            },
            { status: 429 }
          );
        }
      }
    } catch (limitError: any) {
      console.error("❌ Error checking weekly limit:", limitError.message);
      // Continue anyway - limit check is not critical at this point
    }

    // Check queue status (to avoid charging if queue is full)
    try {
      const queueStatusResponse = await fetch(`${agentUrl}/system-status`);
      if (queueStatusResponse.ok) {
        const queueStatus = await queueStatusResponse.json();
        const queueSize = (queueStatus.waiting || 0) + (queueStatus.active || 0);
        const MAX_QUEUE_SIZE = 4; // 4 active, no waiting queue
        if (queueSize >= MAX_QUEUE_SIZE) {
          // Queue is full AFTER payment - issue free ticket
          console.warn("⚠️ Queue is full after payment - issuing free ticket");
          
          // Issue free ticket via agent API
          try {
            await fetch(`${agentUrl}/api/free-ticket`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userWallet: normalizedWalletAddress,
                reason: "queue_full_after_payment",
                metadata: {
                  transactionHash: settlement.transaction,
                  tokenMint,
                  timestamp: new Date().toISOString(),
                },
              }),
            });
          } catch (ticketError) {
            console.error("❌ Failed to issue free ticket:", ticketError);
          }
          
          return NextResponse.json(
            {
              error: "Queue is full",
              message: "Analysis queue is currently full. A free ticket has been issued for your next attempt.",
              freeTicket: true,
              freeTicketReason: "queue_full_after_payment",
              transaction: settlement.transaction,
            },
            { status: 429 }
          );
        }
      }
    } catch (queueError: any) {
      console.error("❌ Error checking queue status:", queueError.message);
      // Continue anyway - queue check is not critical
    }

    // Consume free ticket if used (0.001 USDC payment = TRIAL_PRICE)
    if (hasFreeTicket && paymentAmountUSDC === TRIAL_PRICE) {
      console.log("🎫 [Payment] Consuming free ticket...");
      try {
        const consumeResponse = await fetch(`${agentUrl}/api/free-ticket`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userWallet: normalizedWalletAddress }),
        });
        
        if (consumeResponse.ok) {
          console.log("✅ Free ticket consumed after payment");
        } else {
          console.warn("⚠️ Failed to consume free ticket, but continuing...");
        }
      } catch (ticketError: any) {
        console.warn("⚠️ Error consuming free ticket:", ticketError.message);
        // Continue anyway - ticket consumption is not critical
      }
    }

    // Queue analysis job
    console.log("🚀 Queuing analysis job...");

    try {
      // Normalize wallet address to lowercase for consistent storage
      // Ethereum addresses can be in checksum format (mixed case) or lowercase
      // We always store in lowercase to avoid matching issues
      const normalizedWalletAddress = walletAddress.toLowerCase();
      
      // Final queue check RIGHT BEFORE queuing (to prevent race conditions)
      const finalQueueCheck = await fetch(`${agentUrl}/stats`);
      if (finalQueueCheck.ok) {
        const finalQueueStats = await finalQueueCheck.json();
        const finalQueueSize = (finalQueueStats.waiting || 0) + (finalQueueStats.active || 0);
        const MAX_QUEUE_SIZE = 4; // 4 active, no waiting queue
        
        if (finalQueueSize >= MAX_QUEUE_SIZE) {
          console.warn(`⚠️ Queue is full RIGHT BEFORE queuing: ${finalQueueSize}/${MAX_QUEUE_SIZE} - issuing free ticket`);
          
          // Issue free ticket via agent API
          try {
            await fetch(`${agentUrl}/api/free-ticket`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userWallet: normalizedWalletAddress,
                reason: "queue_full_before_queuing",
                metadata: {
                  transactionHash: settlement.transaction,
                  tokenMint,
                  timestamp: new Date().toISOString(),
                },
              }),
            });
          } catch (ticketError) {
            console.error("❌ Failed to issue free ticket:", ticketError);
          }
          
          return NextResponse.json(
            {
              error: "Queue is full",
              message: `Currently ${finalQueueStats.active || 0} analyses are running simultaneously and our limits are full. Your analysis has failed, but don't worry! A 0.001 USDC analysis ticket has been granted to you. You can generate an analysis at a very low cost.`,
              freeTicket: true,
              freeTicketReason: "queue_full_before_queuing",
              transaction: settlement.transaction,
              queueInfo: {
                active: finalQueueStats.active || 0,
                waiting: finalQueueStats.waiting || 0,
                total: finalQueueSize,
                maxSize: MAX_QUEUE_SIZE,
              },
            },
            { status: 429 }
          );
        }
      }
      
      const analysisResponse = await fetch(`${agentUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint,
          userWallet: normalizedWalletAddress,
          network, // Add network parameter
          transactionLimit: 10000,
        }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json().catch(() => ({}));
        // Payment succeeded but analysis failed - issue free ticket
        console.error("❌ Analysis failed after payment:", errorData.error);
        
        // Issue free ticket via agent API
        try {
          await fetch(`${agentUrl}/api/free-ticket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userWallet: normalizedWalletAddress,
              reason: "analysis_failed_after_payment",
              metadata: {
                transactionHash: settlement.transaction,
                errorMessage: errorData.error || "Failed to queue analysis",
                tokenMint,
                timestamp: new Date().toISOString(),
              },
            }),
          });
        } catch (ticketError) {
          console.error("❌ Failed to issue free ticket:", ticketError);
        }
        
        return NextResponse.json(
          {
            error: "Analysis failed to start",
            message: errorData.error || "Failed to queue analysis",
            transaction: settlement.transaction,
            freeTicket: true,
            freeTicketReason: "analysis_failed_after_payment",
          },
          { status: 500 }
        );
      }

      const analysisData = await analysisResponse.json();

      return NextResponse.json({
        success: true,
        jobId: analysisData.jobId,
        paymentAmount: parseFloat(paymentAmountUSDC) / 1_000_000,
        hasNFT,
        transaction: settlement.transaction,
        payer,
      });
    } catch (error: any) {
      console.error("❌ Failed to queue analysis:", error);
      return NextResponse.json(
        {
          error: "Payment succeeded but analysis failed to start",
          message: error.message,
          transaction: settlement.transaction,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * CDP Facilitator API - Payment settlement
 */
async function settlePaymentWithCDPFacilitator(
  paymentPayload: any,
  paymentRequirements: ReturnType<typeof createPaymentRequirements>
): Promise<{
  success: boolean;
  payer?: string;
  transaction?: string;
  errorReason?: string;
}> {
  try {
    console.log("💰 Settling payment with CDP Facilitator API...");

    const apiKeyId = env.CDP_API_KEY_ID;
    const apiKeySecret = env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.error("❌ CDP API keys not configured");
      return { success: false, errorReason: "api_keys_missing" };
    }

    // Generate JWT token
    const { generateJwt } = await import("@coinbase/cdp-sdk/auth");

    const requestHost = "api.cdp.coinbase.com";
    const requestPath = "/platform/v2/x402/settle";
    const requestMethod = "POST";

    console.log("🔐 Generating CDP JWT token...");
    const token = await generateJwt({
      apiKeyId: apiKeyId,
      apiKeySecret: apiKeySecret,
      requestMethod: requestMethod,
      requestHost: requestHost,
      requestPath: requestPath,
      expiresIn: 120,
    });

    const requestBody = {
      x402Version: 1,
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements,
    };

    console.log("📤 Sending settlement request...");

    const response = await fetch(`https://${requestHost}${requestPath}`, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ CDP Facilitator error:", response.status, errorText);
      return { success: false, errorReason: "facilitator_error" };
    }

    const result = await response.json();
    console.log("✅ CDP Facilitator response:", result);

    return {
      success: true,
      payer: result.payer,
      transaction: result.transaction,
    };
  } catch (error: any) {
    console.error("❌ Settlement error:", error);
    return { success: false, errorReason: "exception" };
  }
}

