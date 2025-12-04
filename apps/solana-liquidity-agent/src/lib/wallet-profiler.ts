/**
 * Wallet Profiler - Wallet yaşı, aktivite ve risk profili analizi
 * 
 * Bu modül:
 * - Wallet yaşını hesaplar (ilk işlem tarihi)
 * - Toplam işlem sayısını bulur
 * - Bot/Human sınıflandırması yapar
 * - Whale/Normal sınıflandırması yapar
 * - Risk profili çıkarır
 */

import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Wallet Profile Interface
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
 * Get comprehensive wallet profile
 * 
 * @param connection Solana RPC connection
 * @param walletAddress Wallet address to profile
 * @param poolTransactionCount Number of transactions this wallet made in the pool
 * @param totalPoolTransactions Total transactions in the pool
 * @returns WalletProfile with age, activity, and risk assessment
 */
export async function getWalletProfile(
  connection: Connection,
  walletAddress: string,
  poolTransactionCount: number,
  totalPoolTransactions: number
): Promise<WalletProfile> {
  try {
    const pubkey = new PublicKey(walletAddress);
    
    // Fetch transaction signatures (all time)
    // Note: This only fetches the most recent 1000 signatures for performance
    // For production, you might want to implement pagination
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 1000 });
    
    const totalTransactions = signatures.length;
    const now = Date.now();
    
    // Calculate wallet age (first transaction)
    let createdAt: Date;
    let ageInDays: number;
    
    if (signatures.length > 0) {
      // Signatures are returned newest-first, so last one is oldest
      const oldestSignature = signatures[signatures.length - 1];
      const firstTxTimestamp = oldestSignature.blockTime ? oldestSignature.blockTime * 1000 : now;
      createdAt = new Date(firstTxTimestamp);
      ageInDays = Math.floor((now - firstTxTimestamp) / (1000 * 60 * 60 * 24));
    } else {
      // No transactions found (very rare, but handle gracefully)
      createdAt = new Date();
      ageInDays = 0;
    }
    
    // Calculate recent activity (last 7 days)
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const recentTransactions = signatures.filter(sig => 
      sig.blockTime && sig.blockTime * 1000 >= sevenDaysAgo
    ).length;
    
    // Average transactions per day
    const avgTxPerDay = ageInDays > 0 ? totalTransactions / ageInDays : totalTransactions;
    
    // Bot detection heuristics
    const isLikelyBot = detectBot(avgTxPerDay, recentTransactions, ageInDays);
    
    // Whale detection (based on pool-specific activity)
    const poolActivityPercentage = (poolTransactionCount / totalPoolTransactions) * 100;
    const isWhale = poolActivityPercentage > 30 || poolTransactionCount > 50;
    
    // Risk assessment
    const riskLevel = assessWalletRisk(isLikelyBot, isWhale, ageInDays, avgTxPerDay);
    
    // Human-readable summary
    const summary = generateWalletSummary({
      ageInDays,
      totalTransactions,
      avgTxPerDay,
      isLikelyBot,
      isWhale,
      poolTransactionCount,
    });
    
    return {
      address: walletAddress,
      ageInDays,
      createdAt,
      totalTransactions,
      recentTransactions,
      avgTxPerDay,
      isLikelyBot,
      isWhale,
      riskLevel,
      summary,
    };
    
  } catch (error: any) {
    console.warn(`[WalletProfiler] Failed to profile wallet ${walletAddress.slice(0, 8)}...: ${error.message}`);
    
    // Return a basic profile on error
    return {
      address: walletAddress,
      ageInDays: 0,
      createdAt: new Date(),
      totalTransactions: 0,
      recentTransactions: 0,
      avgTxPerDay: 0,
      isLikelyBot: false,
      isWhale: false,
      riskLevel: 'medium',
      summary: 'Unable to fetch wallet history',
    };
  }
}

/**
 * Detect if a wallet is likely a bot based on activity patterns
 */
function detectBot(avgTxPerDay: number, recentTxCount: number, ageInDays: number): boolean {
  // Bot indicators:
  // 1. Very high transaction frequency (>100 tx/day)
  // 2. Extremely new account with high activity (< 1 day old, >50 tx)
  // 3. Very consistent transaction pattern (exactly same interval)
  
  if (avgTxPerDay > 100) {
    return true; // Suspiciously high activity
  }
  
  if (ageInDays < 1 && recentTxCount > 50) {
    return true; // Brand new account, immediately very active
  }
  
  return false;
}

/**
 * Assess overall risk level of a wallet
 */
function assessWalletRisk(
  isBot: boolean,
  isWhale: boolean,
  ageInDays: number,
  avgTxPerDay: number
): 'low' | 'medium' | 'high' {
  // High risk factors:
  // - Bot + Whale
  // - Very new account (< 7 days) with whale activity
  // - Extremely high transaction rate
  
  if (isBot && isWhale) {
    return 'high'; // Bot whale - likely manipulation
  }
  
  if (ageInDays < 7 && isWhale) {
    return 'high'; // New whale - suspicious
  }
  
  if (avgTxPerDay > 200) {
    return 'high'; // Extremely active - likely automated
  }
  
  // Medium risk factors:
  // - Whale (but not bot)
  // - Bot (but not whale)
  // - New account (< 30 days)
  
  if (isWhale || isBot) {
    return 'medium';
  }
  
  if (ageInDays < 30) {
    return 'medium'; // Relatively new account
  }
  
  // Low risk:
  // - Established account (> 30 days)
  // - Normal activity level
  
  return 'low';
}

/**
 * Generate human-readable wallet summary
 */
function generateWalletSummary(data: {
  ageInDays: number;
  totalTransactions: number;
  avgTxPerDay: number;
  isLikelyBot: boolean;
  isWhale: boolean;
  poolTransactionCount: number;
}): string {
  const parts: string[] = [];
  
  // Age description
  if (data.ageInDays === 0) {
    parts.push('Brand new wallet');
  } else if (data.ageInDays < 7) {
    parts.push(`${data.ageInDays} days old`);
  } else if (data.ageInDays < 30) {
    parts.push(`${Math.floor(data.ageInDays / 7)} weeks old`);
  } else if (data.ageInDays < 365) {
    parts.push(`${Math.floor(data.ageInDays / 30)} months old`);
  } else {
    parts.push(`${Math.floor(data.ageInDays / 365)} years old`);
  }
  
  // Activity description
  if (data.avgTxPerDay < 1) {
    parts.push('low activity');
  } else if (data.avgTxPerDay < 10) {
    parts.push('moderate activity');
  } else if (data.avgTxPerDay < 50) {
    parts.push('high activity');
  } else {
    parts.push('very high activity');
  }
  
  // Bot indicator
  if (data.isLikelyBot) {
    parts.push('🤖 LIKELY BOT');
  }
  
  // Whale indicator
  if (data.isWhale) {
    parts.push(`🐋 WHALE (${data.poolTransactionCount} pool txs)`);
  }
  
  return parts.join(', ');
}

/**
 * Profile multiple wallets in batch
 * 
 * @param connection Solana RPC connection
 * @param wallets Array of wallet addresses to profile
 * @param poolTransactionCounts Map of wallet address to transaction count
 * @param totalPoolTransactions Total transactions in the pool
 * @returns Array of WalletProfile
 */
export async function batchProfileWallets(
  connection: Connection,
  wallets: string[],
  poolTransactionCounts: Map<string, number>,
  totalPoolTransactions: number
): Promise<WalletProfile[]> {
  console.log(`[WalletProfiler] 🔍 Profiling ${wallets.length} wallets...`);
  
  // Process wallets sequentially to avoid rate limits
  const profiles: WalletProfile[] = [];
  
  for (const wallet of wallets) {
    const poolTxCount = poolTransactionCounts.get(wallet) || 0;
    const profile = await getWalletProfile(
      connection,
      wallet,
      poolTxCount,
      totalPoolTransactions
    );
    profiles.push(profile);
    
    // Small delay to avoid rate limits (10ms between requests)
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log(`[WalletProfiler] ✅ Profiled ${profiles.length} wallets`);
  
  // Log summary of high-risk wallets
  const highRiskCount = profiles.filter(p => p.riskLevel === 'high').length;
  const botCount = profiles.filter(p => p.isLikelyBot).length;
  const whaleCount = profiles.filter(p => p.isWhale).length;
  
  console.log(`[WalletProfiler] 📊 Summary:`);
  console.log(`[WalletProfiler]    High Risk: ${highRiskCount}`);
  console.log(`[WalletProfiler]    Bots: ${botCount}`);
  console.log(`[WalletProfiler]    Whales: ${whaleCount}`);
  
  return profiles;
}

