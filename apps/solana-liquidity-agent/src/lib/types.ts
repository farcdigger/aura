import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (Zod Validation)
// =============================================================================

/**
 * Pool Analysis Input Schema
 * Validates user input for pool analysis requests
 */
export const PoolAnalysisInputSchema = z.object({
  poolId: z
    .string()
    .min(32, 'Pool ID must be at least 32 characters')
    .max(44, 'Pool ID must not exceed 44 characters')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format'),
  userId: z.string().optional(),
  options: z.object({
    transactionLimit: z.number().min(1).max(10000).optional(),
    skipCache: z.boolean().optional(),
  }).optional(),
});

export type PoolAnalysisInput = z.infer<typeof PoolAnalysisInputSchema>;

/**
 * Job Status Check Input Schema
 */
export const JobStatusInputSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

export type JobStatusInput = z.infer<typeof JobStatusInputSchema>;

// =============================================================================
// TOKEN METADATA
// =============================================================================

/**
 * Token Metadata from Helius DAS API
 */
export interface TokenMetadata {
  /** Token mint address */
  mint: string;
  /** Token symbol (e.g., "SOL", "USDC") */
  symbol: string;
  /** Full token name */
  name: string;
  /** Decimal places (e.g., 9 for SOL, 6 for USDC) */
  decimals: number;
  /** Logo image URI (optional) */
  logoURI?: string;
  /** CoinGecko ID for price data (optional) */
  coingeckoId?: string;
  /** Token authorities (for rug pull detection) */
  authorities?: {
    freezeAuthority?: string | null;
    mintAuthority?: string | null;
  };
}

// =============================================================================
// RAYDIUM POOL DATA
// =============================================================================

/**
 * Raydium Pool Reserve Information
 */
export interface PoolReserves {
  /** Token A mint address */
  tokenAMint: string;
  /** Token B mint address */
  tokenBMint: string;
  /** Token A reserve amount (raw, not adjusted for decimals) */
  tokenAReserve: bigint;
  /** Token B reserve amount (raw, not adjusted for decimals) */
  tokenBReserve: bigint;
  /** Pool authority address */
  poolAuthority: string;
  /** Pool LP token mint (optional) */
  lpMint?: string;
}

/**
 * Adjusted Pool Reserves (with decimal adjustment)
 */
export interface AdjustedPoolReserves {
  tokenAMint: string;
  tokenBMint: string;
  /** Token A reserve (human-readable, decimal adjusted) */
  tokenAReserve: number;
  /** Token B reserve (human-readable, decimal adjusted) */
  tokenBReserve: number;
  /** Total Value Locked in USD (if price data available) */
  tvlUSD?: number;
}

// =============================================================================
// TRANSACTION ANALYSIS
// =============================================================================

/**
 * Wallet Activity Pattern
 */
export interface WalletActivity {
  /** Wallet address */
  address: string;
  /** Number of transactions */
  txCount: number;
  /** Percentage of total volume */
  volumeShare: number;
  /** Estimated volume in USD (if available) */
  volumeUSD?: number;
}

/**
 * Transaction Summary from Helius RPC
 */
export interface TransactionSummary {
  /** Total number of transactions analyzed */
  totalCount: number;
  /** Alias for totalCount */
  totalTransactions: number;
  /** Number of buy transactions */
  buyCount: number;
  /** Number of sell transactions */
  sellCount: number;
  /** Average transaction volume in USD */
  avgVolumeUSD: number;
  /** Top active wallets */
  topWallets: WalletActivity[];
  /** Detected suspicious patterns */
  suspiciousPatterns: string[];
  /** Text summary of transaction analysis */
  summary: string;
  /** Time range of analyzed transactions */
  timeRange?: {
    earliest: Date;
    latest: Date;
  };
}

// =============================================================================
// ANALYSIS RESULT
// =============================================================================

/**
 * Complete Pool Analysis Result
 */
export interface AnalysisResult {
  /** Pool ID that was analyzed */
  poolId: string;
  /** Token A metadata */
  tokenA: TokenMetadata;
  /** Token B metadata */
  tokenB: TokenMetadata;
  /** Pool reserve information */
  reserves: AdjustedPoolReserves;
  /** Transaction activity summary */
  transactions: TransactionSummary;
  /** AI-generated risk analysis (Markdown format) */
  riskAnalysis: string;
  /** Risk score (0-100, higher = more risky) */
  riskScore: number;
  /** Timestamp when analysis was generated */
  generatedAt: string;
  /** Model used for analysis */
  modelUsed?: string;
  /** Total tokens used (for cost tracking) */
  tokensUsed?: number;
}

// =============================================================================
// QUEUE JOB DATA
// =============================================================================

/**
 * BullMQ Job Data Structure
 */
export interface QueueJobData {
  /** Pool ID to analyze */
  poolId: string;
  /** User ID (optional, for tracking) */
  userId?: string;
  /** Timestamp when request was made */
  requestedAt?: string;
  /** Priority (optional, higher = more important) */
  priority?: number;
  /** Analysis options */
  options?: {
    /** Number of transactions to fetch (default: 1000) */
    transactionLimit?: number;
    /** Skip cache and force fresh analysis */
    skipCache?: boolean;
  };
}

/**
 * Job Status Response
 */
export interface JobStatusResponse {
  /** Job ID */
  jobId: string;
  /** Current status */
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'not_found';
  /** Progress percentage (0-100) */
  progress?: number;
  /** Result data (if completed) */
  result?: AnalysisResult;
  /** Error message (if failed) */
  error?: string;
  /** Additional metadata */
  metadata?: {
    attempts: number;
    processedAt?: string;
    completedAt?: string;
  };
}

// =============================================================================
// API RESPONSES
// =============================================================================

/**
 * Standard API Response Wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Analysis Request Response
 */
export type AnalysisRequestResponse = ApiResponse<{
  status: 'cached' | 'queued' | 'processing';
  jobId?: string;
  result?: AnalysisResult;
  estimatedWaitTime?: number; // in seconds
}>;

// =============================================================================
// DATABASE TYPES (for Supabase)
// =============================================================================

/**
 * Pool Analysis Record in Database
 */
export interface PoolAnalysisRecord {
  id: string;
  pool_id: string;
  token_a_mint: string;
  token_a_symbol: string;
  token_b_mint: string;
  token_b_symbol: string;
  risk_score: number;
  analysis_report: string;
  reserves_snapshot: AdjustedPoolReserves;
  transaction_summary: TransactionSummary;
  generated_at: string;
  user_id?: string | null;
  created_at: string;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Worker Configuration
 */
export interface WorkerConfig {
  concurrency: number;
  maxAttempts: number;
  backoffDelayMs: number;
}

/**
 * Cache Configuration
 */
export interface CacheConfig {
  ttlSeconds: number;
  keyPrefix: string;
}

/**
 * Environment Configuration
 */
export interface EnvConfig {
  // Agent
  agentName: string;
  agentVersion: string;
  agentPort: number;

  // APIs
  heliusApiKey: string;
  inferenceApiKey: string;
  daydreamsBaseUrl: string;
  reportModel: string;
  maxCompletionTokens: number;

  // Redis
  redisUrl: string;
  cacheTtl: number;

  // Supabase
  supabaseUrl: string;
  supabaseServiceKey: string;

  // Worker
  workerConcurrency: number;
  workerMaxAttempts: number;
  workerBackoffDelay: number;
}




