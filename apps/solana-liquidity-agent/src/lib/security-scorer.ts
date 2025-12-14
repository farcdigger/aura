import { TransactionSummary } from './types';

/**
 * Calculate Security Score based on:
 * 1. Re-entry ratio (users who sold and bought back) - higher = more secure
 * 2. Diamond hands ratio (users still holding) - higher = more secure
 * 3. Early buyers still holding ratio - higher = more secure
 * 
 * Score range: 0-100 (higher = more secure)
 */
export function calculateSecurityScore(transactions: TransactionSummary): number {
  const walletStats = transactions.walletStats;
  
  if (!walletStats) {
    // If no wallet stats available, return neutral score
    return 50;
  }

  // Get the three key metrics
  const reEntryRatio = walletStats.reEntryRatio || 0; // 0-100%
  const diamondHandsRatio = walletStats.diamondHandsRatio || 0; // 0-100%
  const earlyBuyersStillHoldingRatio = walletStats.smartMoneyAnalysis?.earlyBuyersStillHoldingRatio || 0; // 0-100%

  // Weighted average calculation
  // Re-entry ratio: 30% weight (shows confidence after selling)
  // Diamond hands ratio: 40% weight (most important - shows conviction)
  // Early buyers still holding: 30% weight (shows smart money conviction)
  
  const weights = {
    reEntry: 0.30,
    diamondHands: 0.40,
    earlyBuyers: 0.30,
  };

  // Calculate weighted score
  let securityScore = 
    (reEntryRatio * weights.reEntry) +
    (diamondHandsRatio * weights.diamondHands) +
    (earlyBuyersStillHoldingRatio * weights.earlyBuyers);

  // Ensure score is between 0-100
  securityScore = Math.max(0, Math.min(100, securityScore));

  // Round to nearest integer
  return Math.round(securityScore);
}

/**
 * Get security level description based on score
 */
export function getSecurityLevel(score: number): {
  level: 'Very High' | 'High' | 'Medium' | 'Low' | 'Very Low';
  color: string;
  description: string;
} {
  if (score >= 80) {
    return {
      level: 'Very High',
      color: 'green',
      description: 'Excellent security indicators - strong holder conviction',
    };
  } else if (score >= 60) {
    return {
      level: 'High',
      color: 'green',
      description: 'Good security indicators - healthy holder behavior',
    };
  } else if (score >= 40) {
    return {
      level: 'Medium',
      color: 'yellow',
      description: 'Moderate security - mixed holder behavior',
    };
  } else if (score >= 20) {
    return {
      level: 'Low',
      color: 'orange',
      description: 'Low security - weak holder conviction',
    };
  } else {
    return {
      level: 'Very Low',
      color: 'red',
      description: 'Very low security - poor holder behavior',
    };
  }
}

