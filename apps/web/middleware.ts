import { paymentMiddleware, Network } from "x402-next";
import { facilitator } from "@coinbase/x402";

// Recipient wallet address (server signer address)
const RECIPIENT_ADDRESS = "0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF";

// Configure the payment middleware for /api/mint-permit endpoint
// Using CDP facilitator for mainnet (configured via CDP_API_KEY_ID and CDP_API_KEY_SECRET)
// Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers#running-on-mainnet
// 
// NOTE: The facilitator from @coinbase/x402 automatically reads CDP_API_KEY_ID and CDP_API_KEY_SECRET
// from environment variables. Make sure these are set in Vercel environment variables.
export const middleware = paymentMiddleware(
  RECIPIENT_ADDRESS, // Your receiving wallet address
  {
    "/api/mint-permit": {
      price: "$0.1", // 0.1 USDC
      network: "base" as Network, // Base mainnet
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
  facilitator // CDP facilitator for mainnet - automatically configured via CDP_API_KEY_ID and CDP_API_KEY_SECRET env vars
);

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    "/api/mint-permit",
  ],
};

