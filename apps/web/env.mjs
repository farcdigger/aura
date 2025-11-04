import { z } from "zod";

// Development mode için daha esnek validation
const isDevelopment = process.env.NODE_ENV === "development";

const envSchema = z.object({
  NEXT_PUBLIC_CHAIN_ID: z.string().default("84532"), // Base Sepolia testnet
  RPC_URL: z.string().url().optional().or(z.literal("http://localhost:8545")),
  CONTRACT_ADDRESS: z.string().startsWith("0x").optional().or(z.literal("0x0000000000000000000000000000000000000000")),
  NEXT_PUBLIC_CONTRACT_ADDRESS: z.string().startsWith("0x").optional().or(z.literal("0x0000000000000000000000000000000000000000")),
  SERVER_SIGNER_PRIVATE_KEY: z.string().startsWith("0x").optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  X_CALLBACK_URL: z.string().url().optional().or(z.literal("http://localhost:3000/api/auth/x/callback")),
  PINATA_JWT: z.string().optional(),
  WEB3_STORAGE_TOKEN: z.string().optional(),
  INFERENCE_API_KEY: z.string().optional(),
  // Supabase REST API (no PostgreSQL connection string needed)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Legacy: DATABASE_URL is optional now (Supabase REST API is preferred)
  DATABASE_URL: z.string().url().optional().or(z.literal("mock://localhost")),
  // Vercel KV (Redis) - Preferred for rate limiting (faster, more reliable)
  // If Vercel KV is not configured, falls back to Supabase KV (PostgreSQL)
  KV_REST_API_URL: z.string().url().optional().or(z.literal("http://localhost:6379")),
  KV_REST_API_TOKEN: z.string().optional(),
  X402_FACILITATOR_URL: z.string().optional(),
  X402_PRICE_USDC: z.string().default("2000000"), // Amount in USDC (6 decimals, e.g., 2000000 = 2 USDC)
  USDC_CONTRACT_ADDRESS: z.string().startsWith("0x").optional(), // USDC contract address (optional, will use defaults)
  COLLECTION_THEME: z.string().default("frog"),
  MODEL_VERSION: z.string().default("v1.0.0"),
}).transform((data) => ({
  ...data,
  // Boş string'leri undefined yap
  X402_FACILITATOR_URL: data.X402_FACILITATOR_URL === "" ? undefined : data.X402_FACILITATOR_URL,
  PINATA_JWT: data.PINATA_JWT === "" ? undefined : data.PINATA_JWT,
  WEB3_STORAGE_TOKEN: data.WEB3_STORAGE_TOKEN === "" ? undefined : data.WEB3_STORAGE_TOKEN,
  INFERENCE_API_KEY: data.INFERENCE_API_KEY === "" ? undefined : data.INFERENCE_API_KEY,
  // Supabase credentials - boş string'leri undefined yap
  NEXT_PUBLIC_SUPABASE_URL: data.NEXT_PUBLIC_SUPABASE_URL === "" ? undefined : data.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: data.SUPABASE_SERVICE_ROLE_KEY === "" ? undefined : data.SUPABASE_SERVICE_ROLE_KEY,
}));

// Development için default değerler ekle
// NOTE: In production, all environment variables must be explicitly set
const envDefaults = isDevelopment ? {
  RPC_URL: "https://sepolia.base.org",
  CONTRACT_ADDRESS: "0x82866D704fa3203EAD035c1FD339ce916cbC11A1", // Base Sepolia deployed contract
  NEXT_PUBLIC_CONTRACT_ADDRESS: "0x82866D704fa3203EAD035c1FD339ce916cbC11A1", // Base Sepolia deployed contract
  SERVER_SIGNER_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
  X_CLIENT_ID: "mock_client_id",
  X_CLIENT_SECRET: "mock_client_secret",
  X_CALLBACK_URL: "http://localhost:3000/api/auth/x/callback",
  DATABASE_URL: "mock://localhost",
  KV_REST_API_URL: "http://localhost:6379",
  KV_REST_API_TOKEN: "mock_token",
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
