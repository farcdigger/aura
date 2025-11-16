/**
 * x402 Payment endpoint for chat tokens
 * Supports 0.5, 1, 1.5, 2 USD payments
 * 60% of payment becomes tokens (40% profit margin)
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
const RPC_URL = env.RPC_URL || "https://mainnet.base.org";

const RECIPIENT_ADDRESS = "0xDA9097c5672928a16C42889cD4b07d9a766827ee"; // Same as NFT payments
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = "base";

// Payment amounts in USDC (6 decimals)
const PAYMENT_OPTIONS = {
  0.5: "500000",   // 0.5 USDC
  1: "1000000",    // 1 USDC
  1.5: "1500000",  // 1.5 USDC
  2: "2000000",    // 2 USDC
};

// x402 payment requirements
function createPaymentRequirements(amount: string) {
  return {
    scheme: "exact" as const,
    network: NETWORK,
    maxAmountRequired: amount,
    resource: "https://xfroranft.xyz/api/chat/payment",
    description: `Chat tokens payment - ${parseFloat(amount) / 1000000} USDC`,
    mimeType: "application/json",
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: BASE_USDC_ADDRESS,
    extra: {
      name: "USD Coin",
      version: "2"
    }
  };
}

/**
 * GET - Return 402 Payment Required with payment options
 * x402-fetch will call this first to get payment requirements
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const amount = searchParams.get("amount");

  if (!amount || !(amount in PAYMENT_OPTIONS)) {
    // If no amount specified, return all payment options
    const allOptions = Object.entries(PAYMENT_OPTIONS).map(([usdAmount, usdcAmount]) =>
      createPaymentRequirements(usdcAmount)
    );
    
    return NextResponse.json(
      {
        x402Version: 1,
        accepts: allOptions,
      },
      { 
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-Payment-Required": "true"
        }
      }
    );
  }

  const amountNum = parseFloat(amount) as keyof typeof PAYMENT_OPTIONS;
  if (!(amountNum in PAYMENT_OPTIONS)) {
    return NextResponse.json(
      { error: "Invalid payment amount" },
      { status: 400 }
    );
  }

  const paymentAmount = PAYMENT_OPTIONS[amountNum];
  const paymentRequirements = createPaymentRequirements(paymentAmount);

  return NextResponse.json(
    {
      x402Version: 1,
      accepts: [paymentRequirements],
    },
    { 
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Required": "true"
      }
    }
  );
}

/**
 * POST - Process payment and add tokens
 * x402-fetch will send payment header in X-PAYMENT header
 */
export async function POST(request: NextRequest) {
  try {
    // Get amount from query parameter
    const searchParams = request.nextUrl.searchParams;
    const amountFromQuery = searchParams.get("amount");
    
    // Check for x402 payment header (sent by x402-fetch after payment)
    const paymentHeader = request.headers.get("X-PAYMENT");
    
    // Try to get amount from body (x402-fetch sends POST first without payment header)
    // Only read body if payment header is not present (to avoid consuming body twice)
    let amountFromBody: string | null = null;
    if (!paymentHeader) {
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.json().catch(() => null);
        if (body && body.amount) {
          amountFromBody = body.amount.toString();
        }
      } catch (e) {
        // Body parsing failed, continue
      }
    }
    
    if (!paymentHeader) {
      // No payment header - check NFT ownership BEFORE requesting payment
      // Get wallet address from body if available (for NFT check)
      let walletAddressForCheck: string | null = null;
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.json().catch(() => null);
        if (body && body.walletAddress) {
          walletAddressForCheck = body.walletAddress;
        }
      } catch (e) {
        // Body parsing failed, continue
      }

      // If wallet address is provided, check NFT ownership BEFORE requesting payment
      if (walletAddressForCheck && ethers.isAddress(walletAddressForCheck)) {
        const normalizedAddress = ethers.getAddress(walletAddressForCheck);
        
        const ERC721_ABI = [
          "function balanceOf(address owner) external view returns (uint256)",
        ];

        try {
          const provider = new ethers.JsonRpcProvider(RPC_URL);
          const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
          
          const balanceResult = await contract.balanceOf(normalizedAddress);
          const hasNFT = balanceResult > 0n;
          
          if (!hasNFT) {
            console.log("❌ NFT ownership check failed (before payment):", {
              address: normalizedAddress,
              balance: balanceResult.toString(),
            });
            return NextResponse.json(
              { 
                error: "NFT ownership required to purchase tokens",
                message: "You must own an xFrora NFT to purchase tokens. Please mint an NFT first."
              },
              { status: 403 }
            );
          }
          
          console.log("✅ NFT ownership verified (before payment):", {
            address: normalizedAddress,
            balance: balanceResult.toString(),
          });
        } catch (error: any) {
          console.error("❌ Error checking NFT ownership (before payment):", {
            error: error.message,
            address: normalizedAddress,
          });
          return NextResponse.json(
            { 
              error: "Failed to verify NFT ownership",
              message: "Could not verify NFT ownership. Please try again."
            },
            { status: 500 }
          );
        }
      }

      // Determine which amount to use (query > body > all options)
      const requestedAmount = amountFromQuery || amountFromBody;
      
      const requestedAmountNum = requestedAmount ? parseFloat(requestedAmount) : null;
      if (requestedAmountNum && requestedAmountNum in PAYMENT_OPTIONS) {
        // Return only the requested payment option
        const paymentAmount = PAYMENT_OPTIONS[requestedAmountNum as keyof typeof PAYMENT_OPTIONS];
        console.log(`💳 Returning 402 for amount: $${requestedAmount} (${paymentAmount} USDC)`);
        return NextResponse.json(
          {
            x402Version: 1,
            accepts: [createPaymentRequirements(paymentAmount)],
          },
          { 
            status: 402,
            headers: {
              "Content-Type": "application/json",
              "X-Payment-Required": "true"
            }
          }
        );
      }
      
      // Otherwise return all options
      console.log("💳 Returning 402 with all payment options");
      return NextResponse.json(
        {
          x402Version: 1,
          accepts: Object.entries(PAYMENT_OPTIONS).map(([usdAmount, usdcAmount]) =>
            createPaymentRequirements(usdcAmount)
          ),
        },
        { 
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Required": "true"
          }
        }
      );
    }

    // Parse payment payload
    let paymentPayload;
    try {
      // x402-fetch might base64 encode the payload
      if (paymentHeader.startsWith('eyJ')) {
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
        paymentPayload = JSON.parse(decoded);
      } else {
        paymentPayload = JSON.parse(paymentHeader);
      }
      console.log("✅ Payment payload parsed:", {
        x402Version: paymentPayload.x402Version,
        scheme: paymentPayload.scheme,
        network: paymentPayload.network,
        hasPayload: !!paymentPayload.payload
      });
    } catch (error) {
      console.error("❌ Invalid payment header format:", error);
      return NextResponse.json(
        { error: "Invalid payment header" },
        { status: 400 }
      );
    }

    // Determine which payment amount was requested (from query or body)
    const requestedAmount = amountFromQuery || amountFromBody;
    if (!requestedAmount) {
      return NextResponse.json(
        { error: "Payment amount not specified" },
        { status: 400 }
      );
    }

    const requestedAmountNum = parseFloat(requestedAmount) as keyof typeof PAYMENT_OPTIONS;
    if (!(requestedAmountNum in PAYMENT_OPTIONS)) {
      return NextResponse.json(
        { error: "Invalid payment amount" },
        { status: 400 }
      );
    }

    const paymentAmountUSDC = PAYMENT_OPTIONS[requestedAmountNum];
    const paymentRequirements = createPaymentRequirements(paymentAmountUSDC);

    // CRITICAL: Call CDP Facilitator SETTLE API to transfer USDC!
    console.log("💰 Calling CDP Facilitator SETTLE API to transfer USDC...");
    const settlement = await settlePaymentWithCDPFacilitator(paymentPayload, paymentRequirements);
    
    if (!settlement.success) {
      console.error("❌ Payment settlement failed:", settlement.errorReason);
      return NextResponse.json(
        { 
          error: "Payment settlement failed", 
          reason: settlement.errorReason 
        },
        { status: 402 }
      );
    }

    console.log("✅ Payment settled successfully!");
    console.log(`   Payer: ${settlement.payer}`);
    console.log(`   Transaction: ${settlement.transaction}`);

    const walletAddress = settlement.payer || paymentPayload.payload?.authorization?.from;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Could not determine payer address" },
        { status: 400 }
      );
    }

    // Double-check NFT ownership after payment (security measure)
    // Note: We already checked before payment, but this is an extra security layer
    const normalizedAddress = ethers.getAddress(walletAddress);
    
    const ERC721_ABI = [
      "function balanceOf(address owner) external view returns (uint256)",
    ];

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);
      
      const balanceResult = await contract.balanceOf(normalizedAddress);
      const hasNFT = balanceResult > 0n;
      
      if (!hasNFT) {
        console.log("❌ NFT ownership check failed (after payment):", {
          address: normalizedAddress,
          balance: balanceResult.toString(),
        });
        return NextResponse.json(
          { 
            error: "NFT ownership required to purchase tokens",
            message: "You must own an xFrora NFT to purchase tokens. Please mint an NFT first."
          },
          { status: 403 }
        );
      }
      
      console.log("✅ NFT ownership verified (after payment):", {
        address: normalizedAddress,
        balance: balanceResult.toString(),
      });
    } catch (error: any) {
      console.error("❌ Error checking NFT ownership (after payment):", {
        error: error.message,
        address: normalizedAddress,
      });
      return NextResponse.json(
        { 
          error: "Failed to verify NFT ownership",
          message: "Could not verify NFT ownership. Please try again."
        },
        { status: 500 }
      );
    }

    const matchedAmount = requestedAmount;

    // Payment is verified by x402 middleware
    // Calculate tokens: 60% of payment amount (40% profit margin)
    const paymentAmountUSD = parseFloat(matchedAmount);
    const tokenAmountUSD = paymentAmountUSD * 0.6;

    // Calculate Daydreams tokens based on OpenAI GPT-4o-mini pricing
    // GPT-4o-mini pricing (from OpenAI):
    // - Input: $0.15 per 1M tokens
    // - Output: $0.60 per 1M tokens
    // Average cost calculation (weighted by typical usage):
    // Typical chat: ~70% input tokens, ~30% output tokens
    // Average cost per 1M tokens = (0.7 × $0.15) + (0.3 × $0.60) = $0.105 + $0.18 = $0.285 per 1M tokens
    //
    // We use 60% of payment for tokens (40% profit margin), so we have tokenAmountUSD to spend
    // How many tokens can we buy with tokenAmountUSD?
    // tokens = (tokenAmountUSD / $0.285) × 1,000,000
    // 
    // Example: If tokenAmountUSD = $0.60 (from $1 payment, 60%):
    // tokens = ($0.60 / $0.285) × 1,000,000 = 2.105 × 1,000,000 = 2,105,000 tokens
    //
    // However, Daydreams may charge differently or have markup.
    // For now, using the calculated value directly:
    const AVERAGE_COST_PER_1M_TOKENS = 0.285; // $0.285 per 1M tokens (GPT-4o-mini average)
    const tokens = Math.floor((tokenAmountUSD / AVERAGE_COST_PER_1M_TOKENS) * 1_000_000);

    // Save payment and update token balance in database
    const { addTokens } = await import("@/lib/chat-tokens-mock");
    const newBalance = await addTokens(walletAddress, tokens);

    // TODO: Save payment record to database
    // TODO: Calculate actual Daydreams tokens based on GPT-4o-mini pricing
    // For now, using calculated average cost

    return NextResponse.json({
      success: true,
      tokensAdded: tokens,
      newBalance: newBalance,
      paymentAmount: matchedAmount,
      walletAddress: walletAddress,
      transaction: settlement.transaction,
    });
  } catch (error: any) {
    console.error("Error processing payment:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * CDP Facilitator API - Ödeme settlement (USDC transfer)
 * 
 * API Docs: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/settle-a-payment
 * 
 * Bu fonksiyon USDC'yi gerçekten transfer eder!
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
    console.log("💰 Settling payment with CDP Facilitator API (USDC TRANSFER)...");
    
    const apiKeyId = env.CDP_API_KEY_ID;
    const apiKeySecret = env.CDP_API_KEY_SECRET;
    
    if (!apiKeyId || !apiKeySecret) {
      console.error("❌ CDP API keys not configured");
      return { success: false, errorReason: "api_keys_missing" };
    }
    
    // Generate JWT token using @coinbase/cdp-sdk/auth
    const { generateJwt } = await import("@coinbase/cdp-sdk/auth");
    
    const requestHost = "api.cdp.coinbase.com";
    const requestPath = "/platform/v2/x402/settle";
    const requestMethod = "POST";
    
    console.log("🔐 Generating CDP JWT token for settlement...");
    const token = await generateJwt({
      apiKeyId: apiKeyId,
      apiKeySecret: apiKeySecret,
      requestMethod: requestMethod,
      requestHost: requestHost,
      requestPath: requestPath,
      expiresIn: 120
    });
    
    // CRITICAL: Use EXACT same paymentRequirements as 402 response!
    const requestBody = {
      x402Version: 1,
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements
    };
    
    console.log("📤 Sending settlement request to CDP Facilitator (THIS TRANSFERS USDC)...");
    console.log("🔍 Payment requirements:", JSON.stringify(paymentRequirements, null, 2));
    
    const response = await fetch(`https://${requestHost}${requestPath}`, {
      method: requestMethod,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ CDP Facilitator settlement error:");
      console.error("   Status:", response.status);
      console.error("   Response:", errorText);
      return { success: false, errorReason: "facilitator_error" };
    }
    
    const result = await response.json();
    console.log("✅ CDP Facilitator settlement response:", JSON.stringify(result, null, 2));
    
    // CDP returns { payer, transaction } on success
    return {
      success: true,
      payer: result.payer,
      transaction: result.transaction
    };
    
  } catch (error) {
    console.error("❌ Settlement error:", error);
    return { success: false, errorReason: "exception" };
  }
}

