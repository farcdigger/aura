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
        console.log(`[SecurityScorer]   ⚠️ Honeypot detected: -50 points (CRITICAL: token cannot be sold)`);
      }
      
      // Proxy contract: -20 points (high risk)
      if (evm.isProxy) {
        penalty += 20;
        console.log(`[SecurityScorer]   ⚠️ Proxy contract: -20 points (code can be upgraded/changed)`);
      }
      
      // Transfer pausable: -15 points (high risk)
      if (evm.transferPausable) {
        penalty += 15;
        console.log(`[SecurityScorer]   ⚠️ Transfer pausable: -15 points (owner can pause all transfers)`);
      }
      
      // High taxes: -5 to -15 points depending on tax rate
      if (evm.buyTax && evm.buyTax > 10) {
        const taxPenalty = Math.min(15, evm.buyTax * 0.5);
        penalty += taxPenalty;
        console.log(`[SecurityScorer]   ⚠️ High buy tax (${evm.buyTax}%): -${taxPenalty.toFixed(2)} points`);
      }
      if (evm.sellTax && evm.sellTax > 10) {
        const taxPenalty = Math.min(15, evm.sellTax * 0.5);
        penalty += taxPenalty;
        console.log(`[SecurityScorer]   ⚠️ High sell tax (${evm.sellTax}%): -${taxPenalty.toFixed(2)} points`);
      }
      
      // Mintable: -5 points (moderate risk)
      if (evm.mintable) {
        penalty += 5;
        console.log(`[SecurityScorer]   ⚠️ Mintable token: -5 points (supply can be increased)`);
      }
    }
    
    // Solana-specific penalties
    if (tokenSecurity.solanaSecurity) {
      const sol = tokenSecurity.solanaSecurity;
      
      // Freeze authority: -20 points (high risk)
      if (sol.hasFreezeAuthority) {
        penalty += 20;
        console.log(`[SecurityScorer]   ⚠️ Freeze authority: -20 points (can freeze token accounts)`);
      }
      
      // Mint authority: -10 points (moderate risk)
      if (sol.hasMintAuthority) {
        penalty += 10;
        console.log(`[SecurityScorer]   ⚠️ Mint authority: -10 points (can mint more tokens)`);
      }
    }
    
    // Apply penalty (reduce score) - but ensure we don't completely nullify good holder behavior
    if (penalty > 0) {
      console.log(`[SecurityScorer] ⚠️ Total Security Penalty: -${penalty.toFixed(2)} points`);
      const scoreBeforePenalty = securityScore;
      
      // ✅ DÜZELTME: Penalty'leri daha dengeli uygula
      // Eğer base score yüksekse (iyi holder behavior), penalty'leri azalt
      // Minimum güvence: Base score'un %30'u kadar minimum skor garantisi
      const minimumGuaranteedScore = baseScoreBeforePenalties * 0.30; // En az %30'u korunur
      
      // Penalty'yi uygula ama minimum garantiyi koru
      securityScore = Math.max(minimumGuaranteedScore, securityScore - penalty);
      
      console.log(`[SecurityScorer] 📉 Score Calculation:`);
      console.log(`  - Base Score: ${baseScoreBeforePenalties.toFixed(2)}/100`);
      console.log(`  - Penalties: -${penalty.toFixed(2)} points`);
      console.log(`  - After Penalties: ${(scoreBeforePenalty - penalty).toFixed(2)}`);
      console.log(`  - Minimum Guarantee: ${minimumGuaranteedScore.toFixed(2)} (30% of base score)`);
      console.log(`  - Final Score: ${securityScore.toFixed(2)}/100`);
      
      if (securityScore === minimumGuaranteedScore && (scoreBeforePenalty - penalty) < minimumGuaranteedScore) {
        console.log(`[SecurityScorer] ⚠️ Score protected by minimum guarantee (good holder behavior preserved)`);
      }
    } else {
      console.log(`[SecurityScorer] ✅ No security penalties (token is safe)`);
      console.log(`[SecurityScorer] 📊 Final Score: ${securityScore.toFixed(2)}/100 (no penalties applied)`);
    }
  } else {
    console.log(`[SecurityScorer] ⚠️ No token security data available (skipping security checks)`);
    console.log(`[SecurityScorer] 📊 Final Score: ${securityScore.toFixed(2)}/100 (no security data to check)`);
  }

  // Ensure score is between 0-100
  const finalScore = Math.max(0, Math.min(100, securityScore));
  
  console.log(`[SecurityScorer] 🎯 FINAL SECURITY SCORE: ${finalScore}/100`);
  
  // Round to nearest integer
  return Math.round(finalScore);
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

