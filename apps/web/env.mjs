import { z } from "zod";

// Development mode için daha esnek validation
const isDevelopment = process.env.NODE_ENV === "development";

const envSchema = z.object({
  NEXT_PUBLIC_CHAIN_ID: z.string().default("8453"), // Base Mainnet
  RPC_URL: z.string().url().optional().or(z.literal("http://localhost:8545")).default("https://mainnet.base.org"),
  CONTRACT_ADDRESS: z.string().startsWith("0x").optional().or(z.literal("0x0000000000000000000000000000000000000000")).default("0x7De68EB999A314A0f986D417adcbcE515E476396"),
  NEXT_PUBLIC_CONTRACT_ADDRESS: z.string().startsWith("0x").optional().or(z.literal("0x0000000000000000000000000000000000000000")).default("0x7De68EB999A314A0f986D417adcbcE515E476396"),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  SERVER_SIGNER_PRIVATE_KEY: z.string().startsWith("0x").optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  X_CALLBACK_URL: z.string().url().optional().or(z.literal("http://localhost:3000/api/auth/x/callback")),
  PINATA_JWT: z.string().optional(),
  WEB3_STORAGE_TOKEN: z.string().optional(),
  INFERENCE_API_KEY: z.string().optional(),
  // Supabase REST API (no PostgreSQL connection string needed)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  UPDATE_TOKEN_SECRET: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(), // Admin endpoint'leri için API key
  // Legacy: DATABASE_URL is optional now (Supabase REST API is preferred)
  DATABASE_URL: z.string().url().optional().or(z.literal("mock://localhost")),
  // Vercel KV (Redis) - Preferred for rate limiting (faster, more reliable)
  // If Vercel KV is not configured, falls back to Supabase KV (PostgreSQL)
  KV_REST_API_URL: z.string().url().optional().or(z.literal("http://localhost:6379")),
  KV_REST_API_TOKEN: z.string().optional(),
  X402_FACILITATOR_URL: z.string().optional(), // x402 facilitator URL (e.g., https://x402.org/facilitator for testnet, or CDP facilitator for mainnet)
  NEXT_PUBLIC_X402_FACILITATOR_URL: z.string().url().optional(), // Client-side facilitator URL (Coinbase CDP x402)
  CDP_API_KEY_ID: z.string().optional(), // Coinbase CDP API Key ID (for mainnet facilitator)
  CDP_API_KEY_SECRET: z.string().optional(), // Coinbase CDP API Key Secret (for mainnet facilitator)
  X402_PRICE_USDC: z.string().default("5000000"), // Amount in USDC (6 decimals, e.g., 5 USDC = 5_000_000)
  USDC_CONTRACT_ADDRESS: z.string().startsWith("0x").default("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), // Base mainnet USDC contract
  COLLECTION_THEME: z.string().default("frog"),
  MODEL_VERSION: z.string().default("v1.0.0"),
  
  // 🆕 Mesajlaşma geliştirme için
  NEXT_PUBLIC_DEVELOPER_WALLET_ADDRESS: z.string().optional(), // Geliştirici cüzdan adresi
  NEXT_PUBLIC_ENABLE_MESSAGING_FEATURE: z.string().optional().default("false"), // Feature flag
  YAMA_AGENT_TRIGGER_URL: z.string().url().optional(),
  YAMA_AGENT_TRIGGER_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(), // Secret for manual cron trigger protection
  
  // 🆕 Deep Research Integration
  NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal("http://localhost:3000")), // Frontend URL (e.g., https://xfrora.com)
  SOLANA_AGENT_URL: z.string().url().optional().or(z.literal("http://localhost:3002")), // Solana Liquidity Agent backend URL
}).transform((data) => ({
  ...data,
  // Boş string'leri undefined yap
  X402_FACILITATOR_URL: data.X402_FACILITATOR_URL === "" ? undefined : data.X402_FACILITATOR_URL,
  PINATA_JWT: data.PINATA_JWT === "" ? undefined : data.PINATA_JWT,
  WEB3_STORAGE_TOKEN: data.WEB3_STORAGE_TOKEN === "" ? undefined : data.WEB3_STORAGE_TOKEN,
  INFERENCE_API_KEY: data.INFERENCE_API_KEY === "" ? undefined : data.INFERENCE_API_KEY,
  // Supabase credentials - boş string'leri undefined yap
  NEXT_PUBLIC_SUPABASE_URL: data.NEXT_PUBLIC_SUPABASE_URL === "" ? undefined : data.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: data.NEXT_PUBLIC_SUPABASE_ANON_KEY === "" ? undefined : data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: data.SUPABASE_SERVICE_ROLE_KEY === "" ? undefined : data.SUPABASE_SERVICE_ROLE_KEY,
  UPDATE_TOKEN_SECRET: data.UPDATE_TOKEN_SECRET === "" ? undefined : data.UPDATE_TOKEN_SECRET,
  ADMIN_API_KEY: data.ADMIN_API_KEY === "" ? undefined : data.ADMIN_API_KEY,
  YAMA_AGENT_TRIGGER_URL: data.YAMA_AGENT_TRIGGER_URL === "" ? undefined : data.YAMA_AGENT_TRIGGER_URL,
  YAMA_AGENT_TRIGGER_TOKEN: data.YAMA_AGENT_TRIGGER_TOKEN === "" ? undefined : data.YAMA_AGENT_TRIGGER_TOKEN,
  CRON_SECRET: data.CRON_SECRET === "" ? undefined : data.CRON_SECRET,
  // Deep Research URLs - boş string'leri undefined yap
  NEXT_PUBLIC_APP_URL: data.NEXT_PUBLIC_APP_URL === "" ? undefined : data.NEXT_PUBLIC_APP_URL,
  SOLANA_AGENT_URL: data.SOLANA_AGENT_URL === "" ? undefined : data.SOLANA_AGENT_URL,
  // Ensure RPC_URL and CONTRACT_ADDRESS have defaults for Base Mainnet
  RPC_URL: data.RPC_URL || "https://mainnet.base.org",
  CONTRACT_ADDRESS: data.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396",
  // Ensure NEXT_PUBLIC_CONTRACT_ADDRESS has default for client-side
  NEXT_PUBLIC_CONTRACT_ADDRESS: data.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: data.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID === "" ? undefined : data.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
}));

// Development için default değerler ekle
// NOTE: In production, all environment variables must be explicitly set
const envDefaults = isDevelopment ? {
  RPC_URL: "https://mainnet.base.org",
  CONTRACT_ADDRESS: "0x7De68EB999A314A0f986D417adcbcE515E476396", // Base Mainnet deployed contract
  NEXT_PUBLIC_CONTRACT_ADDRESS: "0x7De68EB999A314A0f986D417adcbcE515E476396", // Base Mainnet deployed contract
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "demo", // Replace with your WalletConnect Project ID in production
  SERVER_SIGNER_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
  UPDATE_TOKEN_SECRET: "dev-secret",
  X_CLIENT_ID: "mock_client_id",
  X_CLIENT_SECRET: "mock_client_secret",
  X_CALLBACK_URL: "http://localhost:3000/api/auth/x/callback",
  DATABASE_URL: "mock://localhost",
  KV_REST_API_URL: "http://localhost:6379",
  KV_REST_API_TOKEN: "mock_token",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  SOLANA_AGENT_URL: "http://localhost:3002",
} : {};

// Environment variables'ı parse et
const envRaw = {
  ...envDefaults,
  ...process.env,
};

export const env = envSchema.parse(envRaw);

// Mock mode kontrolü
// Only use mock mode in development OR if DATABASE_URL is explicitly set to mock
export const isMockMode = env.DATABASE_URL === "mock://localhost" || (isDevelopment && !env.DATABASE_URL);
