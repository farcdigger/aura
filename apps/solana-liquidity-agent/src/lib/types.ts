import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (Zod Validation)
// =============================================================================

/**
 * Pool Analysis Input Schema (HYBRID)
 * Validates user input for pool analysis requests
 * 
 * Users can provide EITHER:
 * 1. poolId: Direct pool address (for specific pool analysis)
 * 2. tokenMint: Token mint address (auto-finds best pool)
 * 3. Both: Token mint + specific pool ID (advanced)
 */
export const PoolAnalysisInputSchema = z.object({
  // Pool ID (optional if tokenMint provided)
  poolId: z
    .string()
    .min(32, 'Pool ID must be at least 32 characters')
    .max(44, 'Pool ID must not exceed 44 characters')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format')
    .optional(),
  
  // Token Mint (optional if poolId provided)
  tokenMint: z
    .string()
    .min(32, 'Token mint must be at least 32 characters')
    .max(44, 'Token mint must not exceed 44 characters')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format')
    .optional(),
  
  userId: z.string().optional(),
  
  options: z.object({
    transactionLimit: z.number().min(1).max(10000).optional(),
    skipCache: z.boolean().optional(),
    // If tokenMint provided, prefer specific DEX
    preferredDEX: z.enum(['raydium-v4', 'raydium-clmm', 'orca', 'meteora', 'auto']).optional(),
  }).optional(),
}).refine(
  (data) => data.poolId || data.tokenMint,
  {
    message: 'Either poolId or tokenMint must be provided',
    path: ['poolId', 'tokenMint'],
  }
);

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
  /** Token A symbol (for display) */
  tokenASymbol?: string;
  /** Token B symbol (for display) */
  tokenBSymbol?: string;
  /** Token A amount (alias for tokenAReserve) */
  tokenAAmount?: number;
  /** Token B amount (alias for tokenBReserve) */
  tokenBAmount?: number;
  /** Total Value Locked in USD (if price data available) */
  tvlUSD?: number;
  /** LP token mint address */
  lpMint?: string;
  /** LP token supply */
  lpSupply?: string;
  /** Pool status text (Active/Disabled/etc) */
  poolStatus?: string;
  /** Fee information */
  feeInfo?: string;
  /** Estimated TVL (alias) */
  estimatedTVL?: number;
  /** Pool type (AMM V4, CLMM, etc) */
  poolType?: string;
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
  /** Total volume (raw amount) */
  totalVolume?: bigint;
  /** Percentage of total volume */
  volumeShare: number;
  /** Estimated volume in USD (if available) */
  volumeUSD?: number;
  /** First seen timestamp */
  firstSeen?: number;
  /** Last seen timestamp */
  lastSeen?: number;
}

/**
 * Top Trader Information
 */
export interface TopTrader {
  /** Wallet address */
  wallet: string;
  /** Number of buy transactions */
  buyCount: number;
  /** Number of sell transactions */
  sellCount: number;
  /** Total volume traded */
  volume: number;
}

/**
 * Wallet Profile (Advanced)
 */
export interface WalletProfile {
  /** Wallet address */
  address: string;
  /** Wallet age in days */
  ageInDays: number;
  /** Account creation date (first transaction) */
  createdAt: Date;
  /** Total transaction count (all time) */
  totalTransactions: number;
  /** Recent transaction count (last 7 days) */
  recentTransactions: number;
  /** Average transactions per day */
  avgTxPerDay: number;
  /** Is this likely a bot? */
  isLikelyBot: boolean;
  /** Is this a whale wallet? (based on pool-specific activity) */
  isWhale: boolean;
  /** Risk level: low, medium, high */
  riskLevel: 'low' | 'medium' | 'high';
  /** Human-readable summary */
  summary: string;
}

/**
 * Parsed Swap Transaction
 */
export interface ParsedSwap {
  /** Transaction signature */
  signature: string;
  /** Block timestamp */
  timestamp: number;
  /** Wallet that initiated the swap */
  wallet: string;
  /** Swap direction (buy = SOL → Token, sell = Token → SOL) */
  direction: 'buy' | 'sell';
  /** Amount in (raw) */
  amountIn: bigint;
  /** Amount out (raw) */
  amountOut: bigint;
  /** Amount in USD (for volume calculations) */
  amountInUsd?: number;
  /** Amount out USD (for volume calculations) */
  amountOutUsd?: number;
  /** Price impact percentage (optional) */
  priceImpact?: number;
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
  /** Number of unique wallets */
  uniqueWallets?: number;
  /** Top active wallets */
  topWallets: WalletActivity[];
  /** Top traders with buy/sell breakdown */
  topTraders?: TopTrader[];
  /** Detected suspicious patterns */
  suspiciousPatterns: string[];
  /** Text summary of transaction analysis */
  summary: string;
  /** Time range of analyzed transactions */
  timeRange?: {
    earliest: Date;
    latest: Date;
  };
  /** Wallet profiles for top traders (Phase 3) */
  walletProfiles?: WalletProfile[];
}

// =============================================================================
// ANALYSIS RESULT
// =============================================================================

/**
 * Risk Score Breakdown (Phase 3)
 */
export interface RiskScoreBreakdown {
  totalScore: number;
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'critical';
  factors: {
    liquidity: { score: number; weight: number; reason: string };
    tokenAuthorities: { score: number; weight: number; reason: string };
    tradingActivity: { score: number; weight: number; reason: string };
    walletConcentration: { score: number; weight: number; reason: string };
    botActivity: { score: number; weight: number; reason: string };
    historicalTrend: { score: number; weight: number; reason: string };
  };
  summary: string;
}

/**
 * Pool History Trend (Phase 3)
 */
export interface PoolHistoryTrend {
  poolId: string;
  dataPoints: number;
  daysTracked: number;
  tvl: {
    current: number;
    sevenDaysAgo?: number;
    changePercent?: number;
    trend: 'up' | 'down' | 'stable' | 'unknown';
    summary: string;
  };
  volume: {
    avgDailyTransactions: number;
    recentVsHistorical?: number;
    trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
    summary: string;
  };
  stability: {
    isStable: boolean;
    volatility: number;
    level: 'highly_stable' | 'stable' | 'moderate' | 'volatile' | 'unknown';
    summary: string;
  };
  risk: {
    current: number;
    historicalAvg?: number;
    trend: 'improving' | 'worsening' | 'stable' | 'unknown';
    summary: string;
  };
  history: Array<{
    timestamp: Date;
    tvlUSD: number;
    transactionCount: number;
    buyCount: number;
    sellCount: number;
    riskScore: number;
  }>;
}

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
  /** Pool history trend (Phase 3) */
  poolHistory?: PoolHistoryTrend;
  /** Algorithmic risk score breakdown (Phase 3) */
  riskScoreBreakdown?: RiskScoreBreakdown;
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
  /** User wallet address (for user-specific reports) */
  userWallet?: string;
  /** Token mint (optional, for Pump.fun pool support) */
  tokenMint?: string;
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




