import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (Zod Validation)
// =============================================================================

export const PoolAnalysisInputSchema = z.object({
  poolId: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/)
    .optional(),
  tokenMint: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/)
    .optional(),
  userId: z.string().optional(),
  options: z.object({
    transactionLimit: z.number().min(1).max(10000).optional(),
    skipCache: z.boolean().optional(),
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

export const JobStatusInputSchema = z.object({
  jobId: z.string().min(1),
});

export type JobStatusInput = z.infer<typeof JobStatusInputSchema>;

// =============================================================================
// TOKEN & POOL DATA
// =============================================================================

export interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
  authorities?: {
    freezeAuthority?: string | null;
    mintAuthority?: string | null;
  };
}

export interface PoolReserves {
  tokenAMint: string;
  tokenBMint: string;
  tokenAReserve: bigint;
  tokenBReserve: bigint;
  poolAuthority: string;
  lpMint?: string;
}

export interface AdjustedPoolReserves {
  tokenAMint: string;
  tokenBMint: string;
  tokenAReserve: number;
  tokenBReserve: number;
  tokenASymbol?: string;
  tokenBSymbol?: string;
  tokenAAmount?: number;
  tokenBAmount?: number;
  tvlUSD?: number;
  lpMint?: string;
  lpSupply?: string;
  poolStatus?: string;
  feeInfo?: string;
  estimatedTVL?: number;
  poolType?: string;
}

// =============================================================================
// DEXSCREENER TYPES (Worker.ts Hataları İçin Düzeltildi)
// =============================================================================

/**
 * Worker.ts dosyasındaki kod yapısına tam uyan tip tanımı.
 * 'dexLabel', 'liquidityBase' gibi düzleştirilmiş (flattened) alanları içerir.
 */
export interface DexScreenerData {
  poolAddress: string;
  dexLabel: string; // Worker 'dexId' yerine 'dexLabel' kullanıyor
  liquidityUsd: number;
  priceUsd?: string;
  
  // Worker.ts doğrudan bu alanlara erişiyor
  liquidityBase: number; // ✅ Zorunlu hale getirildi (tip güvenliği için)
  liquidityQuote: number; // ✅ Zorunlu hale getirildi (tip güvenliği için)
  
  // ✅ Zorunlu alanlar (tip güvenliği için)
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
}

// Geriye dönük uyumluluk için (eğer başka yerde kullanılıyorsa)
export type DexScreenerPair = DexScreenerData;

// =============================================================================
// TRANSACTION ANALYSIS (Claude-Prompt.ts Hataları İçin Düzeltildi)
// =============================================================================

/**
 * Wallet Activity Pattern
 * claude-prompt.ts içindeki hataları gidermek için tüm alanlar ZORUNLU yapıldı.
 */
export interface WalletActivity {
  address: string;
  txCount: number;
  volumeShare: number;
  
  // ✅ Prompt.ts hatası: Bunlar artık zorunlu (optional ? kaldırıldı)
  buyCount: number;
  sellCount: number;
  volumeUSD: number;
  
  totalVolume?: bigint;
  firstSeen?: number;
  lastSeen?: number;
}

export interface HighValueWallet {
  address: string;
  totalBuyVolume: number;
  buyCount: number;
  largestBuy: number;
  avgBuySize?: number;
  lastBuyTime?: number;
  hasSoldAfterBuy: boolean;
  sellAfterBuyCount: number;
  totalSellVolume: number;
  sellCount: number;
  largestSell: number;
  avgSellSize?: number;
  lastSellTime?: number;
  hasBoughtAfterSell: boolean;
  buyAfterSellCount: number;
}

export interface TopTrader {
  wallet: string;
  buyCount: number;
  sellCount: number;
  volume: number;
}

export interface WalletProfile {
  address: string;
  ageInDays: number;
  createdAt: Date;
  totalTransactions: number;
  recentTransactions: number;
  avgTxPerDay: number;
  isLikelyBot: boolean;
  isWhale: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

export interface ParsedSwap {
  signature: string;
  timestamp: number;
  slot?: number;
  wallet: string;
  signer?: string;
  direction: 'buy' | 'sell';
  amountIn: bigint;
  amountOut: bigint;
  amountInUsd?: number;
  amountOutUsd?: number;
  priceToken?: number;
  priceImpact?: number;
}

/**
 * Transaction Summary
 * uniqueWallets hatası için undefined olma durumu kaldırıldı.
 */
export interface TransactionSummary {
  totalCount: number;
  totalTransactions: number;
  buyCount: number;
  sellCount: number;
  avgVolumeUSD: number;
  
  // ✅ Prompt.ts hatası: uniqueWallets artık undefined olamaz
  uniqueWallets: number; 
  
  totalVolumeUSD?: number;
  // ✅ DÜZELTME: Buy ve sell volume'ü ayrı ayrı ekle
  buyVolumeUSD?: number;
  sellVolumeUSD?: number;
  
  // ✅ YENİ: Cüzdan analizi istatistikleri
  walletStats?: {
    diamondHandsCount: number; // Sattıktan sonra geri alım yapmayan cüzdan sayısı
    reEntryCount: number; // Sattıktan sonra geri alım yapan cüzdan sayısı
    diamondHandsRatio: number; // Diamond hands oranı (%)
    reEntryRatio: number; // Re-entry oranı (%)
    totalHighValueWallets: number; // Toplam yüksek değerli cüzdan sayısı
    newWalletRatio: number; // Yeni cüzdan oranı (%)
    manipulationWallets: number; // Aynı anda alım-satım yapan manipülasyon cüzdanları
    manipulationRatio: number; // Manipülasyon cüzdan oranı (%)
    manipulationTotalVolume?: number; // Wash trading yapan cüzdanların toplam hacmi (USD)
    manipulationVolumePercent?: number; // Toplam hacme göre manipülasyon hacmi (%)
    manipulationBuyVolume?: number; // Manipülasyon alım hacmi (USD)
    manipulationBuyVolumePercent?: number; // Toplam alım hacmine göre manipülasyon alım hacmi (%)
    manipulationSellVolume?: number; // Manipülasyon satış hacmi (USD)
    manipulationSellVolumePercent?: number; // Toplam satış hacmine göre manipülasyon satış hacmi (%)
    manipulationWalletAddresses?: string[]; // Manipülasyon yapan cüzdan adresleri
    estimatedPriceImpactFromManipulationBuy?: number; // Manipülasyon alımlarının tahmini fiyat etkisi (%)
    estimatedPriceImpactFromManipulationSell?: number; // Manipülasyon satışlarının tahmini fiyat etkisi (%)
    diamondHandsTotalVolume?: number; // Elmas eller cüzdanlarının toplam alım hacmi (USD)
    reEntryTotalSellVolume?: number; // Yeniden giriş yapan cüzdanların toplam satış hacmi (USD)
    reEntryTotalBuyBackVolume?: number; // Yeniden giriş yapan cüzdanların geri alım hacmi (USD)
    panicSellIndicators?: {
      velocitySpike: number; // İşlem hızı artışı (x katı)
      priceDrop: number; // Fiyat düşüşü (%)
      sellVolumeSpike: number; // Satış hacmi artışı (x katı)
    };
    fomoBuyIndicators?: {
      velocitySpike: number; // İşlem hızı artışı (x katı)
      priceRise: number; // Fiyat artışı (%)
      buyVolumeSpike: number; // Alım hacmi artışı (x katı)
    };
  };
  
  topWallets: WalletActivity[];
  topTraders?: TopTrader[];
  suspiciousPatterns: string[];
  summary: string;
  timeRange?: {
    earliest: Date;
    latest: Date;
  };
  walletProfiles?: WalletProfile[];
  highValueBuyers?: HighValueWallet[];
  highValueSellers?: HighValueWallet[];
  largeBuyRatio?: number;
  largeSellRatio?: number;
}

// =============================================================================
// ANALYSIS RESULT & HISTORY
// =============================================================================

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
    level: 'very_stable' | 'highly_stable' | 'stable' | 'moderate' | 'volatile' | 'high_volatility' | 'unknown';
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

export interface AnalysisResult {
  poolId: string;
  tokenA: TokenMetadata;
  tokenB: TokenMetadata;
  reserves: AdjustedPoolReserves;
  transactions: TransactionSummary;
  riskAnalysis: string;
  riskScore: number;
  generatedAt: string;
  modelUsed?: string;
  tokensUsed?: number;
  poolHistory?: PoolHistoryTrend;
  riskScoreBreakdown?: RiskScoreBreakdown;
}

// =============================================================================
// QUEUE & API
// =============================================================================

export interface QueueJobData {
  poolId: string;
  userId?: string;
  userWallet?: string;
  tokenMint?: string;
  requestedAt?: string;
  priority?: number;
  options?: {
    transactionLimit?: number;
    skipCache?: boolean;
  };
}

export interface JobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'not_found';
  progress?: number;
  result?: AnalysisResult;
  error?: string;
  metadata?: {
    attempts: number;
    processedAt?: string;
    completedAt?: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export type AnalysisRequestResponse = ApiResponse<{
  status: 'cached' | 'queued' | 'processing';
  jobId?: string;
  result?: AnalysisResult;
  estimatedWaitTime?: number;
}>;

// =============================================================================
// DATABASE TYPES
// =============================================================================

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

export interface WorkerConfig {
  concurrency: number;
  maxAttempts: number;
  backoffDelayMs: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  keyPrefix: string;
}

export interface EnvConfig {
  agentName: string;
  agentVersion: string;
  agentPort: number;
  heliusApiKey: string;
  inferenceApiKey: string;
  daydreamsBaseUrl: string;
  reportModel: string;
  maxCompletionTokens: number;
  redisUrl: string;
  cacheTtl: number;
  supabaseUrl: string;
  supabaseServiceKey: string;
  workerConcurrency: number;
  workerMaxAttempts: number;
  workerBackoffDelay: number;
}