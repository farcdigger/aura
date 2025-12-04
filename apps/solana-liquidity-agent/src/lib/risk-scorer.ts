/**
 * Advanced Risk Scoring Algorithm
 * 
 * Bu modül AI'ın risk skoruna ek olarak algoritmik bir risk skoru hesaplar.
 * Böylece AI'ın sonucu doğrulanabilir ve fallback olarak kullanılabilir.
 * 
 * Risk Faktörleri:
 * - Liquidity (TVL)
 * - Token authorities (freeze/mint)
 * - Trading activity (buy/sell ratio)
 * - Wallet concentration
 * - Bot activity
 * - Historical trend
 */

import type {
  AdjustedPoolReserves,
  TransactionSummary,
  TokenMetadata,
  PoolHistoryTrend,
} from './types';

/**
 * Risk Score Breakdown
 */
export interface RiskScoreBreakdown {
  /** Total risk score (0-100, higher = more risky) */
  totalScore: number;
  /** Risk level */
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'critical';
  /** Individual risk factors */
  factors: {
    liquidity: { score: number; weight: number; reason: string };
    tokenAuthorities: { score: number; weight: number; reason: string };
    tradingActivity: { score: number; weight: number; reason: string };
    walletConcentration: { score: number; weight: number; reason: string };
    botActivity: { score: number; weight: number; reason: string };
    historicalTrend: { score: number; weight: number; reason: string };
  };
  /** Summary explanation */
  summary: string;
}

/**
 * Calculate comprehensive risk score
 * 
 * @param reserves Pool reserves data
 * @param tokenA Token A metadata
 * @param tokenB Token B metadata
 * @param transactions Transaction summary
 * @param poolHistory Historical trend data
 * @returns Risk score breakdown with detailed factors
 */
export function calculateRiskScore(
  reserves: AdjustedPoolReserves,
  tokenA: TokenMetadata,
  tokenB: TokenMetadata,
  transactions: TransactionSummary,
  poolHistory?: PoolHistoryTrend
): RiskScoreBreakdown {
  console.log(`[RiskScorer] 🎯 Calculating algorithmic risk score...`);
  
  // Individual risk factors (0-100, higher = more risky)
  const liquidityRisk = assessLiquidityRisk(reserves);
  const authoritiesRisk = assessTokenAuthoritiesRisk(tokenA, tokenB);
  const tradingRisk = assessTradingActivityRisk(transactions);
  const concentrationRisk = assessWalletConcentrationRisk(transactions);
  const botRisk = assessBotActivityRisk(transactions);
  const historicalRisk = assessHistoricalTrendRisk(poolHistory);
  
  // Weights for each factor (total = 1.0)
  const weights = {
    liquidity: 0.25,        // 25% - Most important
    authorities: 0.20,      // 20% - Critical for rug pull risk
    trading: 0.15,          // 15% - Important for manipulation
    concentration: 0.15,    // 15% - Important for manipulation
    botActivity: 0.10,      // 10% - Moderate concern
    historical: 0.15,       // 15% - Context is important
  };
  
  // Calculate weighted total score
  const totalScore = Math.round(
    liquidityRisk.score * weights.liquidity +
    authoritiesRisk.score * weights.authorities +
    tradingRisk.score * weights.trading +
    concentrationRisk.score * weights.concentration +
    botRisk.score * weights.botActivity +
    historicalRisk.score * weights.historical
  );
  
  // Determine risk level
  let riskLevel: RiskScoreBreakdown['riskLevel'];
  if (totalScore < 20) {
    riskLevel = 'very_low';
  } else if (totalScore < 40) {
    riskLevel = 'low';
  } else if (totalScore < 60) {
    riskLevel = 'medium';
  } else if (totalScore < 80) {
    riskLevel = 'high';
  } else {
    riskLevel = 'critical';
  }
  
  // Generate summary
  const summary = generateRiskSummary(totalScore, riskLevel, {
    liquidity: liquidityRisk,
    authorities: authoritiesRisk,
    trading: tradingRisk,
    concentration: concentrationRisk,
    botActivity: botRisk,
    historical: historicalRisk,
  });
  
  console.log(`[RiskScorer] ✅ Risk Score: ${totalScore}/100 (${riskLevel})`);
  
  return {
    totalScore,
    riskLevel,
    factors: {
      liquidity: { ...liquidityRisk, weight: weights.liquidity },
      tokenAuthorities: { ...authoritiesRisk, weight: weights.authorities },
      tradingActivity: { ...tradingRisk, weight: weights.trading },
      walletConcentration: { ...concentrationRisk, weight: weights.concentration },
      botActivity: { ...botRisk, weight: weights.botActivity },
      historicalTrend: { ...historicalRisk, weight: weights.historical },
    },
    summary,
  };
}

/**
 * Assess liquidity risk (TVL-based)
 */
function assessLiquidityRisk(reserves: AdjustedPoolReserves): { score: number; reason: string } {
  const tvl = reserves.tvlUSD || reserves.estimatedTVL || 0;
  
  let score: number;
  let reason: string;
  
  if (tvl >= 1_000_000) {
    score = 0;
    reason = `Deep liquidity ($${(tvl / 1_000_000).toFixed(1)}M TVL) - very low slippage risk`;
  } else if (tvl >= 500_000) {
    score = 10;
    reason = `Good liquidity ($${(tvl / 1_000).toFixed(0)}K TVL) - low slippage risk`;
  } else if (tvl >= 100_000) {
    score = 30;
    reason = `Moderate liquidity ($${(tvl / 1_000).toFixed(0)}K TVL) - some slippage risk`;
  } else if (tvl >= 10_000) {
    score = 60;
    reason = `Shallow liquidity ($${(tvl / 1_000).toFixed(0)}K TVL) - high slippage risk`;
  } else {
    score = 90;
    reason = `Very low liquidity ($${tvl.toFixed(0)} TVL) - CRITICAL slippage risk`;
  }
  
  return { score, reason };
}

/**
 * Assess token authorities risk (freeze/mint authority)
 */
function assessTokenAuthoritiesRisk(tokenA: TokenMetadata, tokenB: TokenMetadata): { score: number; reason: string } {
  const hasFreeze = tokenA.authorities?.freezeAuthority || tokenB.authorities?.freezeAuthority;
  const hasMint = tokenA.authorities?.mintAuthority || tokenB.authorities?.mintAuthority;
  
  let score: number;
  let reason: string;
  
  if (hasFreeze && hasMint) {
    score = 90;
    reason = 'CRITICAL: Both freeze and mint authority enabled - high rug pull risk';
  } else if (hasFreeze) {
    score = 70;
    reason = 'HIGH: Freeze authority enabled - tokens can be frozen';
  } else if (hasMint) {
    score = 50;
    reason = 'MEDIUM: Mint authority enabled - supply can be inflated';
  } else {
    score = 0;
    reason = 'No dangerous authorities detected';
  }
  
  return { score, reason };
}

/**
 * Assess trading activity risk (buy/sell ratio)
 */
function assessTradingActivityRisk(transactions: TransactionSummary): { score: number; reason: string } {
  if (transactions.totalCount === 0) {
    return { score: 80, reason: 'No trading activity detected - dead pool' };
  }
  
  const buyRatio = transactions.buyCount / transactions.totalCount;
  const sellRatio = transactions.sellCount / transactions.totalCount;
  
  let score: number;
  let reason: string;
  
  // Ideal ratio is close to 50/50
  const imbalance = Math.abs(buyRatio - 0.5) * 2; // 0 to 1 scale
  
  if (imbalance < 0.2) {
    score = 0;
    reason = `Healthy buy/sell balance (${(buyRatio * 100).toFixed(1)}% buys)`;
  } else if (imbalance < 0.4) {
    score = 30;
    reason = `Slight buy/sell imbalance (${(buyRatio * 100).toFixed(1)}% buys)`;
  } else if (imbalance < 0.6) {
    score = 60;
    reason = `Significant buy/sell imbalance (${(buyRatio * 100).toFixed(1)}% buys) - possible manipulation`;
  } else {
    score = 90;
    reason = `Extreme buy/sell imbalance (${(buyRatio * 100).toFixed(1)}% buys) - HIGH manipulation risk`;
  }
  
  return { score, reason };
}

/**
 * Assess wallet concentration risk
 */
function assessWalletConcentrationRisk(transactions: TransactionSummary): { score: number; reason: string } {
  if (transactions.topWallets.length === 0) {
    return { score: 50, reason: 'Unable to assess wallet concentration' };
  }
  
  const topWalletShare = transactions.topWallets[0]?.volumeShare || 0;
  
  let score: number;
  let reason: string;
  
  if (topWalletShare < 10) {
    score = 0;
    reason = `Low concentration (top wallet: ${topWalletShare.toFixed(1)}%)`;
  } else if (topWalletShare < 20) {
    score = 20;
    reason = `Moderate concentration (top wallet: ${topWalletShare.toFixed(1)}%)`;
  } else if (topWalletShare < 30) {
    score = 50;
    reason = `High concentration (top wallet: ${topWalletShare.toFixed(1)}%)`;
  } else if (topWalletShare < 50) {
    score = 70;
    reason = `Very high concentration (top wallet: ${topWalletShare.toFixed(1)}%) - possible manipulation`;
  } else {
    score = 90;
    reason = `CRITICAL concentration (top wallet: ${topWalletShare.toFixed(1)}%) - HIGH manipulation risk`;
  }
  
  return { score, reason };
}

/**
 * Assess bot activity risk
 */
function assessBotActivityRisk(transactions: TransactionSummary): { score: number; reason: string } {
  if (!transactions.walletProfiles || transactions.walletProfiles.length === 0) {
    return { score: 0, reason: 'No wallet profiling data available' };
  }
  
  const botCount = transactions.walletProfiles.filter(p => p.isLikelyBot).length;
  const totalProfiles = transactions.walletProfiles.length;
  const botPercentage = (botCount / totalProfiles) * 100;
  
  let score: number;
  let reason: string;
  
  if (botPercentage === 0) {
    score = 0;
    reason = 'No bot activity detected among top traders';
  } else if (botPercentage < 25) {
    score = 20;
    reason = `Low bot activity (${botCount}/${totalProfiles} bots detected)`;
  } else if (botPercentage < 50) {
    score = 50;
    reason = `Moderate bot activity (${botCount}/${totalProfiles} bots detected)`;
  } else {
    score = 80;
    reason = `HIGH bot activity (${botCount}/${totalProfiles} bots detected) - possible automated manipulation`;
  }
  
  return { score, reason };
}

/**
 * Assess historical trend risk
 */
function assessHistoricalTrendRisk(poolHistory?: PoolHistoryTrend): { score: number; reason: string } {
  if (!poolHistory || poolHistory.dataPoints === 0) {
    return { score: 50, reason: 'No historical data (new pool - exercise caution)' };
  }
  
  let score = 0;
  const concerns: string[] = [];
  
  // TVL trend
  if (poolHistory.tvl.trend === 'down' && poolHistory.tvl.changePercent && poolHistory.tvl.changePercent < -30) {
    score += 30;
    concerns.push('TVL declining sharply');
  } else if (poolHistory.tvl.trend === 'down') {
    score += 15;
    concerns.push('TVL declining');
  }
  
  // Volume trend
  if (poolHistory.volume.trend === 'decreasing') {
    score += 10;
    concerns.push('volume declining');
  }
  
  // Stability
  if (poolHistory.stability.level === 'volatile') {
    score += 20;
    concerns.push('high volatility');
  } else if (poolHistory.stability.level === 'moderate') {
    score += 10;
    concerns.push('moderate volatility');
  }
  
  // Risk trend
  if (poolHistory.risk.trend === 'worsening') {
    score += 20;
    concerns.push('risk increasing');
  }
  
  const reason = concerns.length > 0
    ? `Historical concerns: ${concerns.join(', ')}`
    : `Stable history over ${poolHistory.daysTracked} days`;
  
  return { score: Math.min(score, 100), reason };
}

/**
 * Generate human-readable risk summary
 */
function generateRiskSummary(
  totalScore: number,
  riskLevel: string,
  factors: Record<string, { score: number; reason: string }>
): string {
  const topConcerns = Object.entries(factors)
    .filter(([_, factor]) => factor.score >= 50)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([name, factor]) => `${name}: ${factor.reason}`);
  
  if (topConcerns.length === 0) {
    return `Overall ${riskLevel} risk (${totalScore}/100). Pool shows healthy metrics.`;
  }
  
  return `Overall ${riskLevel} risk (${totalScore}/100). Key concerns: ${topConcerns.join('; ')}.`;
}

