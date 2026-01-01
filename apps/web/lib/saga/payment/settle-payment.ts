/**
 * CDP Facilitator API - Ödeme settlement (USDC transfer)
 * 
 * API Docs: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/settle-a-payment
 * 
 * Bu fonksiyon USDC'yi gerçekten transfer eder!
 */

import { env } from "@/env.mjs";

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
  };
}

export interface SettlementResult {
  success: boolean;
  payer?: string;
  transaction?: string;
  errorReason?: string;
}

export async function settlePaymentWithCDPFacilitator(
  paymentPayload: any,
  paymentRequirements: PaymentRequirements
): Promise<SettlementResult> {
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

