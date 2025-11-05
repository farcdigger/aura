import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { paymentMiddleware, Network } from "x402-next";
import { facilitator } from "@coinbase/x402";

// Recipient wallet address (server signer address)
const RECIPIENT_ADDRESS = "0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF";

// Configure the payment middleware for /api/mint-permit endpoint
// Using CDP facilitator for mainnet (configured via CDP_API_KEY_ID and CDP_API_KEY_SECRET)
// Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers#running-on-mainnet
export const middleware = paymentMiddleware(
  RECIPIENT_ADDRESS, // Your receiving wallet address
  {
    "/api/mint-permit": {
      price: "$0.1", // 0.1 USDC
      network: "base" as Network, // Base mainnet (changed from "base-sepolia" for mainnet)
      config: {
        description: "Mint permit for Aura Creatures NFT",
        maxTimeoutSeconds: 300, // 5 minutes
        outputSchema: {
          type: "object",
          properties: {
            auth: {
              type: "object",
              properties: {
                to: { type: "string" },
                payer: { type: "string" },
                xUserId: { type: "string" },
                tokenURI: { type: "string" },
                nonce: { type: "number" },
                deadline: { type: "number" },
              },
            },
            signature: { type: "string" },
          },
        },
      },
    },
  },
  facilitator // CDP facilitator for mainnet (this was previously { url: "https://x402.org/facilitator" } for testnet)
);

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    "/api/mint-permit",
  ],
};

