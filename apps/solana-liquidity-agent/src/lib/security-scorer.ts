import { TransactionSummary } from './types';
import type { TokenSecurity } from './token-security';

/**
 * Calculate Security Score based on:
 * 1. Re-entry ratio (users who sold and bought back) - higher = more secure
 * 2. Diamond hands ratio (users still holding) - higher = more secure
 * 3. Early buyers still holding ratio - higher = more secure
 * 4. Token security risks (EVM: taxes, honeypot, proxy; Solana: authorities) - lower = more secure
 * 
 * Score range: 0-100 (higher = more secure)
 */
export function calculateSecurityScore(
  transactions: TransactionSummary,
  tokenSecurity?: TokenSecurity
): number {
  const walletStats = transactions.walletStats;
  
  if (!walletStats) {
    // If no wallet stats available, return neutral score
    console.warn('[SecurityScorer] ⚠️ No walletStats available, returning neutral score 50');
    return 50;
  }

  // Get the three key metrics
  const reEntryRatio = walletStats.reEntryRatio || 0; // 0-100%
  const diamondHandsRatio = walletStats.diamondHandsRatio || 0; // 0-100%
  const earlyBuyersStillHoldingRatio = walletStats.smartMoneyAnalysis?.earlyBuyersStillHoldingRatio || 0; // 0-100%
  
  // Debug logging to understand why score might be 0
  console.log('[SecurityScorer] 📊 Input Metrics:');
  console.log(`  - Re-Entry Ratio: ${reEntryRatio.toFixed(2)}% (30% weight)`);
  console.log(`  - Diamond Hands Ratio: ${diamondHandsRatio.toFixed(2)}% (40% weight)`);
  console.log(`  - Early Buyers Still Holding: ${earlyBuyersStillHoldingRatio.toFixed(2)}% (30% weight)`);
  console.log(`  - Has Smart Money Analysis: ${!!walletStats.smartMoneyAnalysis}`);
  console.log(`  - Has Token Security Data: ${!!tokenSecurity}`);

  // Weighted average calculation
  // Re-entry ratio: 30% weight (shows confidence after selling)
  // Diamond hands ratio: 40% weight (most important - shows conviction)
  // Early buyers still holding: 30% weight (shows smart money conviction)
  
  const weights = {
    reEntry: 0.30,
    diamondHands: 0.40,
    earlyBuyers: 0.30,
  };

  // Calculate base weighted score from transaction metrics
  let securityScore = 
    (reEntryRatio * weights.reEntry) +
    (diamondHandsRatio * weights.diamondHands) +
    (earlyBuyersStillHoldingRatio * weights.earlyBuyers);

  // Apply token security penalties (if available)
  let penalty = 0;
  if (tokenSecurity) {
    console.log('[SecurityScorer] 🔍 Checking token security risks...');
    
    // EVM-specific penalties
    if (tokenSecurity.evmSecurity) {
      const evm = tokenSecurity.evmSecurity;
      
      // Honeypot: -50 points (critical risk)
      if (evm.isHoneypot) {
        penalty += 50;
      }
      
      // Proxy contract: -20 points (high risk)
      if (evm.isProxy) {
        penalty += 20;
      }
      
      // Transfer pausable: -15 points (high risk)
      if (evm.transferPausable) {
        penalty += 15;
      }
      
      // High taxes: -5 to -15 points depending on tax rate
      if (evm.buyTax && evm.buyTax > 10) {
        penalty += Math.min(15, evm.buyTax * 0.5); // Max 15 points penalty
      }
      if (evm.sellTax && evm.sellTax > 10) {
        penalty += Math.min(15, evm.sellTax * 0.5); // Max 15 points penalty
      }
      
      // Mintable: -5 points (moderate risk)
      if (evm.mintable) {
        penalty += 5;
      }
    }
    
    // Solana-specific penalties
    if (tokenSecurity.solanaSecurity) {
      const sol = tokenSecurity.solanaSecurity;
      
      // Freeze authority: -20 points (high risk)
      if (sol.hasFreezeAuthority) {
        penalty += 20;
      }
      
      // Mint authority: -10 points (moderate risk)
      if (sol.hasMintAuthority) {
        penalty += 10;
      }
    }
    
    // Apply penalty (reduce score)
    if (penalty > 0) {
      console.log(`[SecurityScorer] ⚠️ Security Penalty Applied: -${penalty.toFixed(2)} points`);
      securityScore = Math.max(0, securityScore - penalty);
    } else {
      console.log(`[SecurityScorer] ✅ No security penalties (token is safe)`);
    }
  } else {
    console.log(`[SecurityScorer] ⚠️ No token security data available (skipping security checks)`);
  }

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

