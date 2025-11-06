import { paymentMiddleware, Network } from 'x402-next';
import { facilitator } from "@coinbase/x402";

// Recipient wallet address - where you want to receive payments
const RECIPIENT_ADDRESS = "0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF";

// Configure the payment middleware
// Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
export const middleware = paymentMiddleware(
  RECIPIENT_ADDRESS,
  {
    '/api/mint-permit': {
      price: '$0.1',
      network: "base" as Network,
      config: {
        description: 'Mint permit for Aura Creatures NFT'
      }
    },
  },
  facilitator
);

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/api/mint-permit',
  ]
};
