// apps/solana-liquidity-agent/src/lib/transaction-parser.ts

import type { ParsedSwap, TransactionSummary, WalletActivity, TopTrader } from './types';

// =============================================================================
// KNOWN DEX PROGRAM IDS (Mainnet)
// =============================================================================

/**
 * Known Solana DEX Program IDs
 * These are used to detect swap transactions from various protocols
 */
export const DEX_PROGRAM_IDS = {
  // Raydium
  RAYDIUM_AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  
  // Orca
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  
  // Meteora
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  
  // Pump.fun
  PUMPFUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  
  // Jupiter Aggregator (optional - aggregates other DEXs)
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
} as const;

/**
 * Check if a program ID belongs to a known DEX
 */
export function isKnownDEXProgram(programId: string): boolean {
  return Object.values(DEX_PROGRAM_IDS).includes(programId);
}

/**
 * Parse a single transaction to detect if it's a swap and determine direction
 * 
 * NEW: Instruction-based detection (supports modern DEXs)
 * - First checks if transaction contains known DEX program instructions
 * - Then analyzes token balance changes to determine buy/sell direction
 * - Works with: Raydium CLMM, Orca Whirlpool, Meteora, and classic AMMs
 * 
 * @param transaction Parsed transaction from Helius/Solana RPC
 * @param poolTokenMints Optional: Token mints for the pool (for filtering)
 * @returns ParsedSwap or null if not a swap transaction
 */
export function parseSwapTransaction(
  transaction: any,
  poolTokenMints?: { tokenA: string; tokenB: string }
): ParsedSwap | null {
  try {
    const { signature, blockTime, meta, transaction: txData } = transaction;

    if (!meta || !txData) {
      return null;
    }

    // ✅ STEP 1: Check if transaction contains DEX instructions
    const message = txData.message || txData;
    const instructions = message.instructions || [];
    const innerInstructions = meta.innerInstructions || [];

    // Check outer instructions
    let hasDEXInstruction = false;
    for (const instruction of instructions) {
      const programId = instruction.programId?.toString() || instruction.programId;
      if (programId && isKnownDEXProgram(programId)) {
        hasDEXInstruction = true;
        break;
      }
    }

    // Check inner instructions (cross-program invocations)
    if (!hasDEXInstruction) {
      for (const inner of innerInstructions) {
        const innerInsts = inner.instructions || [];
        for (const inst of innerInsts) {
          const programId = inst.programId?.toString() || inst.programId;
          if (programId && isKnownDEXProgram(programId)) {
            hasDEXInstruction = true;
            break;
          }
        }
        if (hasDEXInstruction) break;
      }
    }

    // If no DEX instruction found, this is likely not a swap
    if (!hasDEXInstruction) {
      return null;
    }

    // ✅ STEP 2: Analyze token balance changes
    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];

    if (preTokenBalances.length === 0 || postTokenBalances.length === 0) {
      return null; // No token balance changes = not a valid swap
    }

    // Get the wallet address (first signer)
    const accountKeys = message.accountKeys || [];
    if (accountKeys.length === 0) {
      return null;
    }

    const wallet = accountKeys[0]?.pubkey?.toString() || accountKeys[0]?.toString() || accountKeys[0];

    // ✅ STEP 3: Calculate all token balance changes
    // Get all unique mints that changed
    const allMints = new Set<string>();
    preTokenBalances.forEach((b: any) => b.mint && allMints.add(b.mint));
    postTokenBalances.forEach((b: any) => b.mint && allMints.add(b.mint));

    // If poolTokenMints provided, filter to only those tokens
    const relevantMints = poolTokenMints
      ? Array.from(allMints).filter(
          (mint) => mint === poolTokenMints.tokenA || mint === poolTokenMints.tokenB
        )
      : Array.from(allMints);

    if (relevantMints.length === 0) {
      return null; // No relevant tokens
    }

    // Calculate balance changes for each relevant mint
    const allChanges = relevantMints.map((mint) => ({
      mint,
      changes: calculateBalanceChange(preTokenBalances, postTokenBalances, mint),
    }));

    // Find user's balance changes (wallet address matches)
    let userIncreasedToken: { mint: string; delta: number } | null = null;
    let userDecreasedToken: { mint: string; delta: number } | null = null;

    for (const { mint, changes } of allChanges) {
      for (const change of changes) {
        // Look for the user's wallet in token changes
        if (change.delta > 0 && !userIncreasedToken) {
          userIncreasedToken = { mint, delta: change.delta };
        } else if (change.delta < 0 && !userDecreasedToken) {
          userDecreasedToken = { mint, delta: Math.abs(change.delta) };
        }
      }
    }

    if (!userIncreasedToken && !userDecreasedToken) {
      return null; // No clear swap pattern
    }

    // ✅ STEP 4: Determine direction
    let direction: 'buy' | 'sell';
    let amountIn = BigInt(0);
    let amountOut = BigInt(0);

    // If we have pool context, use it to determine direction
    if (poolTokenMints) {
      if (userIncreasedToken && userIncreasedToken.mint === poolTokenMints.tokenA) {
        // Received Token A = BUY
        direction = 'buy';
        amountOut = BigInt(Math.floor(userIncreasedToken.delta * 1e9));
        amountIn = userDecreasedToken ? BigInt(Math.floor(userDecreasedToken.delta * 1e9)) : BigInt(0);
      } else if (userDecreasedToken && userDecreasedToken.mint === poolTokenMints.tokenA) {
        // Sent Token A = SELL
        direction = 'sell';
        amountIn = BigInt(Math.floor(userDecreasedToken.delta * 1e9));
        amountOut = userIncreasedToken ? BigInt(Math.floor(userIncreasedToken.delta * 1e9)) : BigInt(0);
      } else {
        // Default: if we increased any token, it's a buy
        direction = userIncreasedToken ? 'buy' : 'sell';
        amountOut = userIncreasedToken ? BigInt(Math.floor(userIncreasedToken.delta * 1e9)) : BigInt(0);
        amountIn = userDecreasedToken ? BigInt(Math.floor(userDecreasedToken.delta * 1e9)) : BigInt(0);
      }
    } else {
      // No pool context - generic detection
      // Convention: if we received token, it's a buy
      direction = userIncreasedToken ? 'buy' : 'sell';
      amountOut = userIncreasedToken ? BigInt(Math.floor(userIncreasedToken.delta * 1e9)) : BigInt(0);
      amountIn = userDecreasedToken ? BigInt(Math.floor(userDecreasedToken.delta * 1e9)) : BigInt(0);
    }

    return {
      signature,
      timestamp: blockTime || 0,
      wallet,
      direction,
      amountIn,
      amountOut,
    };
  } catch (error: any) {
    console.error('[TransactionParser] Failed to parse swap:', error.message);
    return null;
  }
}

/**
 * Calculate token balance changes between pre and post balances
 * 
 * @param pre Pre-transaction balances
 * @param post Post-transaction balances
 * @param mint Token mint address to filter
 * @returns Array of balance changes per wallet
 */
function calculateBalanceChange(
  pre: any[],
  post: any[],
  mint: string
): Array<{ wallet: string; delta: number }> {
  const changes: Map<string, number> = new Map();

  // Build a map of pre-balances
  pre.forEach((balance) => {
    if (balance.mint === mint) {
      const wallet = balance.owner || 'unknown';
      const amount = balance.uiTokenAmount?.uiAmount || 0;
      changes.set(wallet, -amount); // Negative (will be offset by post)
    }
  });

  // Add post-balances
  post.forEach((balance) => {
    if (balance.mint === mint) {
      const wallet = balance.owner || 'unknown';
      const amount = balance.uiTokenAmount?.uiAmount || 0;
      const currentDelta = changes.get(wallet) || 0;
      changes.set(wallet, currentDelta + amount);
    }
  });

  return Array.from(changes.entries())
    .filter(([_, delta]) => Math.abs(delta) > 0.000001) // Filter out dust
    .map(([wallet, delta]) => ({
      wallet,
      delta,
    }));
}

/**
 * Analyze a list of parsed swaps and generate comprehensive statistics
 * 
 * @param transactions Array of parsed swap transactions
 * @returns TransactionSummary with buy/sell counts, wallet activity, and suspicious patterns
 */
export function analyzeTransactions(
  transactions: ParsedSwap[],
  reserves?: { tvlUSD?: number }
): TransactionSummary {
  const walletMap = new Map<string, {
    address: string;
    transactionCount: number;
    buyCount: number;
    sellCount: number;
    totalVolume: bigint;
    volumeUSD?: number;
    firstSeen: number;
    lastSeen: number;
  }>();

  let buyCount = 0;
  let sellCount = 0;

  // Process each transaction
  transactions.forEach((tx) => {
    // Count buys and sells
    if (tx.direction === 'buy') {
      buyCount++;
    } else {
      sellCount++;
    }

    // Track wallet activity
    const existing = walletMap.get(tx.wallet) || {
      address: tx.wallet,
      transactionCount: 0,
      buyCount: 0,
      sellCount: 0,
      totalVolume: BigInt(0),
      volumeUSD: 0,
      firstSeen: tx.timestamp,
      lastSeen: tx.timestamp,
    };

    existing.transactionCount++;
    if (tx.direction === 'buy') {
      existing.buyCount++;
    } else {
      existing.sellCount++;
    }
    existing.totalVolume += tx.amountIn;
    existing.lastSeen = Math.max(existing.lastSeen, tx.timestamp);
    
    // Track USD volume if available
    if (tx.amountInUsd !== undefined) {
      existing.volumeUSD = (existing.volumeUSD || 0) + tx.amountInUsd;
    }

    walletMap.set(tx.wallet, existing);
  });

  // Calculate total volume for percentage calculations
  const totalVolume = Array.from(walletMap.values()).reduce(
    (sum, w) => sum + w.totalVolume,
    BigInt(0)
  );

  // Calculate total USD volume for avgVolumeUSD (needed for pattern detection)
  // ✅ DÜZELTME: Buy ve sell volume'ü ayrı ayrı hesapla
  const buyVolumeUSD = transactions
    .filter(tx => tx.direction === 'buy' && tx.amountInUsd !== undefined)
    .reduce((sum, tx) => sum + (tx.amountInUsd || 0), 0);
  
  const sellVolumeUSD = transactions
    .filter(tx => tx.direction === 'sell' && tx.amountInUsd !== undefined)
    .reduce((sum, tx) => sum + (tx.amountInUsd || 0), 0);
  
  const totalUsdVolume = buyVolumeUSD + sellVolumeUSD;
  const avgVolumeUSD = totalUsdVolume > 0 && transactions.length > 0 
    ? totalUsdVolume / transactions.length 
    : 0;

  // Calculate timestamps and timeRange EARLY (needed for multiple pattern detections)
  // Note: tx.timestamp is in milliseconds (from Birdeye API: blockUnixTime * 1000)
  const timestamps = transactions.map(tx => tx.timestamp).filter(t => t > 0);
  const timeRange = timestamps.length > 0 ? {
    earliest: new Date(Math.min(...timestamps)),
    latest: new Date(Math.max(...timestamps)),
  } : undefined;
  const timeRangeDays = timeRange ? (timeRange.latest.getTime() - timeRange.earliest.getTime()) / (1000 * 60 * 60 * 24) : 0;

  // Detect suspicious patterns
  const suspiciousPatterns: string[] = [];

  // 1. Wash trading detection (same wallet with many round-trip trades)
  walletMap.forEach((activity) => {
    const minTrades = Math.min(activity.buyCount, activity.sellCount);
    if (minTrades >= 10) {
      suspiciousPatterns.push(
        `Possible wash trading: ${activity.address.slice(0, 8)}... made ${minTrades} round-trip trades`
      );
    }
  });

  // 2. Whale detection (single wallet controls >30% of volume)
  if (totalVolume > BigInt(0)) {
    walletMap.forEach((activity) => {
      const sharePercent = Number((activity.totalVolume * BigInt(10000)) / totalVolume) / 100;
      if (sharePercent > 30) {
        suspiciousPatterns.push(
          `Whale activity: ${activity.address.slice(0, 8)}... controls ${sharePercent.toFixed(1)}% of volume`
        );
      }
    });
  }

  // 3. Buy/Sell imbalance (extreme ratios indicate manipulation)
  const totalCount = transactions.length;
  if (totalCount > 0) {
    const buyRatio = buyCount / totalCount;
    if (buyRatio > 0.85) {
      suspiciousPatterns.push('Extremely high buy ratio (>85%) - potential pump scheme');
    } else if (buyRatio < 0.15) {
      suspiciousPatterns.push('Extremely high sell ratio (>85%) - potential dump or panic selling');
    }
  }

  // 4. Rapid buy/sell cycles (wallet buys and sells within short time)
  walletMap.forEach((activity) => {
    if (activity.buyCount > 0 && activity.sellCount > 0) {
      // Check if buys and sells are interleaved (rapid cycles)
      const buySellPairs = Math.min(activity.buyCount, activity.sellCount);
      if (buySellPairs >= 5 && activity.transactionCount < 20) {
        // High ratio of round-trips to total trades
        suspiciousPatterns.push(
          `Rapid trading cycles: ${activity.address.slice(0, 8)}... made ${buySellPairs} quick buy-sell cycles`
        );
      }
    }
  });

  // 5. Large single transactions (whale dumps/pumps)
  const largeTransactionThreshold = avgVolumeUSD * 10; // 10x average
  const largeTransactions = transactions.filter(tx => {
    const txVolume = tx.amountInUsd || tx.amountOutUsd || 0;
    return txVolume > largeTransactionThreshold;
  });
  if (largeTransactions.length > 0) {
    suspiciousPatterns.push(
      `Large transactions detected: ${largeTransactions.length} trades exceed ${(largeTransactionThreshold / 1000).toFixed(0)}K USD (${((largeTransactions.length / totalCount) * 100).toFixed(1)}% of all trades)`
    );
  }

  // 6. Time-based patterns (clustered trading activity)
  // timestamps already calculated above, reuse it
  if (timestamps.length > 10) {
    // Group transactions by hour
    const hourlyGroups = new Map<number, number>();
    timestamps.forEach(ts => {
      const hour = new Date(ts).getHours(); // ts is already in milliseconds
      hourlyGroups.set(hour, (hourlyGroups.get(hour) || 0) + 1);
    });
    
    // Find hours with unusually high activity (>20% of trades in single hour)
    const maxHourTrades = Math.max(...Array.from(hourlyGroups.values()));
    const maxHourPercent = (maxHourTrades / totalCount) * 100;
    if (maxHourPercent > 20) {
      const peakHour = Array.from(hourlyGroups.entries()).find(([_, count]) => count === maxHourTrades)?.[0];
      suspiciousPatterns.push(
        `Concentrated trading activity: ${maxHourPercent.toFixed(1)}% of trades happened in a single hour (${peakHour}:00) - possible coordinated pump`
      );
    }
  }

  // 7. New wallet activity (many wallets with only 1-2 transactions)
  const newWalletCount = Array.from(walletMap.values()).filter(w => w.transactionCount <= 2).length;
  const newWalletPercent = (newWalletCount / walletMap.size) * 100;
  if (newWalletPercent > 50 && walletMap.size > 10) {
    suspiciousPatterns.push(
      `High new wallet activity: ${newWalletPercent.toFixed(1)}% of wallets have only 1-2 trades - possible bot farm or fake accounts`
    );
  }

  // 8. Volume spikes (sudden increases in trading volume)
  if (transactions.length > 100) {
    // Split into 10 time windows
    const windowSize = Math.floor(transactions.length / 10);
    const windowVolumes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const window = transactions.slice(i * windowSize, (i + 1) * windowSize);
      const windowVolume = window.reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
      windowVolumes.push(windowVolume);
    }
    
    const avgWindowVolume = windowVolumes.reduce((a, b) => a + b, 0) / windowVolumes.length;
    const maxWindowVolume = Math.max(...windowVolumes);
    if (maxWindowVolume > avgWindowVolume * 3 && avgWindowVolume > 0) {
      suspiciousPatterns.push(
        `Volume spike detected: Trading volume spiked ${(maxWindowVolume / avgWindowVolume).toFixed(1)}x above average - possible pump or dump event`
      );
    }
  }

  // 9. Bot-like behavior (very consistent trade sizes or timing)
  const tradeSizes = transactions
    .map(tx => tx.amountInUsd || tx.amountOutUsd || 0)
    .filter(size => size > 0);
  if (tradeSizes.length > 20) {
    // Check for many identical trade sizes (bot signature)
    const sizeCounts = new Map<number, number>();
    tradeSizes.forEach(size => {
      const rounded = Math.round(size / 10) * 10; // Round to nearest $10
      sizeCounts.set(rounded, (sizeCounts.get(rounded) || 0) + 1);
    });
    const maxSizeCount = Math.max(...Array.from(sizeCounts.values()));
    if (maxSizeCount > tradeSizes.length * 0.3) {
      suspiciousPatterns.push(
        `Bot-like trading patterns: ${((maxSizeCount / tradeSizes.length) * 100).toFixed(1)}% of trades have similar sizes - possible automated trading`
      );
    }
  }

  // 10. Price manipulation (rapid price changes)
  // Note: This requires price data which may not always be available
  const priceChanges: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (prev.priceToken && curr.priceToken && prev.priceToken > 0) {
      const change = Math.abs((curr.priceToken - prev.priceToken) / prev.priceToken) * 100;
      priceChanges.push(change);
    } else if (prev.amountOutUsd && curr.amountInUsd && prev.amountInUsd && curr.amountOutUsd) {
      // Fallback to old method if priceToken not available
      const prevPrice = prev.amountOutUsd / prev.amountInUsd;
      const currPrice = curr.amountOutUsd / curr.amountInUsd;
      if (prevPrice > 0) {
        const change = Math.abs((currPrice - prevPrice) / prevPrice) * 100;
        priceChanges.push(change);
      }
    }
  }
  if (priceChanges.length > 10) {
    const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const highVolatilityCount = priceChanges.filter(change => change > 10).length;
    if (highVolatilityCount > priceChanges.length * 0.2) {
      suspiciousPatterns.push(
        `High price volatility: ${((highVolatilityCount / priceChanges.length) * 100).toFixed(1)}% of trades show >10% price swings - possible manipulation`
      );
    }
  }

  // ============================================================================
  // ADVANCED FORENSIC PATTERNS (6 New Detection Algorithms)
  // ============================================================================
  // timeRange and timeRangeDays already calculated above (at the beginning of function)

  // 11. MAFYA KÜMESİ (Cluster Analysis) - Synchronized wallet activity
  // Detect wallets trading in the same second (coordinated bot activity)
  if (transactions.length > 20) {
    // Group transactions by second (timestamp rounded to nearest second)
    const secondGroups = new Map<number, ParsedSwap[]>();
    transactions.forEach(tx => {
      const second = Math.floor(tx.timestamp / 1000);
      if (!secondGroups.has(second)) {
        secondGroups.set(second, []);
      }
      secondGroups.get(second)!.push(tx);
    });

    // Find seconds with multiple wallets trading simultaneously
    let clusterCount = 0;
    let clusterVolume = 0;
    const clusterWallets = new Set<string>();
    
    secondGroups.forEach((txs, second) => {
      if (txs.length >= 3) { // At least 3 transactions in same second
        const uniqueWallets = new Set(txs.map(tx => tx.wallet));
        if (uniqueWallets.size >= 3) { // At least 3 different wallets
          clusterCount++;
          const secondVolume = txs.reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
          clusterVolume += secondVolume;
          uniqueWallets.forEach(w => clusterWallets.add(w));
        }
      }
    });

    if (clusterCount > 0 && totalUsdVolume > 0) {
      const clusterVolumePercent = (clusterVolume / totalUsdVolume) * 100;
      if (clusterVolumePercent > 20) {
        suspiciousPatterns.push(
          `⚠️ Manipulation Cluster: ${clusterWallets.size} wallets performing synchronized activity within the same seconds. ${clusterVolumePercent.toFixed(1)}% of volume consists of coordinated transactions - artificial pump risk`
        );
      }
    }
  }

  // 12. KÂR BASINCI (Profit Pressure) - Calculate holder cost basis
  // Track average entry price per wallet to determine profit/loss pressure
  if (transactions.length > 50 && transactions.some(tx => tx.priceToken)) {
    const walletCostBasis = new Map<string, { totalCost: number; totalTokens: number; avgPrice: number }>();
    const currentPrice = transactions[0]?.priceToken; // Most recent price (transactions are usually sorted newest first)
    
    // Calculate cost basis for each wallet (only for buys)
    transactions.forEach(tx => {
      if (tx.direction === 'buy' && tx.priceToken && tx.amountOutUsd) {
        const existing = walletCostBasis.get(tx.wallet) || { totalCost: 0, totalTokens: 0, avgPrice: 0 };
        existing.totalCost += tx.amountOutUsd; // USD spent
        // Calculate tokens received: amountOutUsd / priceToken
        const tokensReceived = tx.priceToken > 0 ? tx.amountOutUsd / tx.priceToken : 0;
        existing.totalTokens += tokensReceived;
        walletCostBasis.set(tx.wallet, existing);
      }
    });

    // Calculate average price per wallet
    walletCostBasis.forEach((basis, wallet) => {
      if (basis.totalTokens > 0) {
        basis.avgPrice = basis.totalCost / basis.totalTokens;
      }
    });

    // Analyze profit pressure
    if (currentPrice && currentPrice > 0) {
      let profitableWallets = 0;
      let totalProfitableVolume = 0;
      let unprofitableWallets = 0;
      let totalUnprofitableVolume = 0;

      walletCostBasis.forEach((basis, wallet) => {
        if (basis.avgPrice > 0) {
          const profitMultiplier = currentPrice / basis.avgPrice;
          const walletVolume = walletMap.get(wallet)?.volumeUSD || 0;
          
          if (profitMultiplier >= 1.5) { // 1.5x+ profit
            profitableWallets++;
            totalProfitableVolume += walletVolume;
          } else if (profitMultiplier < 0.9) { // 10%+ loss
            unprofitableWallets++;
            totalUnprofitableVolume += walletVolume;
          }
        }
      });

      const totalWalletsWithBasis = walletCostBasis.size;
      if (totalWalletsWithBasis > 0) {
        const profitablePercent = (profitableWallets / totalWalletsWithBasis) * 100;
        const profitableVolumePercent = totalUsdVolume > 0 ? (totalProfitableVolume / totalUsdVolume) * 100 : 0;
        
        if (profitablePercent > 70 && profitableVolumePercent > 30) {
          suspiciousPatterns.push(
            `💰 KÂR BASINCI: Cüzdanların ${profitablePercent.toFixed(0)}%'i şu an 1.5x+ kârda. Hacmin ${profitableVolumePercent.toFixed(1)}%'i kârlı cüzdanlardan. Büyük bir kâr satışı (profit taking) duvarı gelebilir`
          );
        } else if (unprofitableWallets > totalWalletsWithBasis * 0.6) {
          suspiciousPatterns.push(
            `📉 ZARAR BASINCI: Cüzdanların ${((unprofitableWallets / totalWalletsWithBasis) * 100).toFixed(0)}%'i zararda. İlk yükselişte başa baş noktasında (break-even) kaçış başlayabilir`
          );
        }
      }
    }
  }

  // 13. YEMLEME & TUZAK (Bait Watch) - High transaction count but no price movement
  // Detect micro-transactions trying to manipulate trending lists
  if (transactions.length > 100) {
    // Split into time windows (e.g., 1-minute windows)
    const windowSize = 60 * 1000; // 1 minute in milliseconds
    const windows = new Map<number, { count: number; volume: number; priceStart?: number; priceEnd?: number }>();
    
    transactions.forEach(tx => {
      const window = Math.floor(tx.timestamp / windowSize) * windowSize;
      const existing = windows.get(window) || { count: 0, volume: 0 };
      existing.count++;
      existing.volume += tx.amountInUsd || tx.amountOutUsd || 0;
      if (tx.priceToken) {
        if (!existing.priceStart) existing.priceStart = tx.priceToken;
        existing.priceEnd = tx.priceToken;
      }
      windows.set(window, existing);
    });

    // Find windows with high transaction count but low volume or no price movement
    let baitWindows = 0;
    windows.forEach((window, time) => {
      const avgTxSize = window.volume / window.count;
      const priceChange = window.priceStart && window.priceEnd 
        ? Math.abs((window.priceEnd - window.priceStart) / window.priceStart) * 100 
        : 0;
      
      // High transaction count but small average size and no price movement
      if (window.count > 20 && avgTxSize < 10 && priceChange < 2) {
        baitWindows++;
      }
    });

    if (baitWindows > windows.size * 0.2) {
      suspiciousPatterns.push(
        `🎣 YEMLEME & TUZAK: ${baitWindows} zaman penceresinde dakikada 20+ işlem var ama fiyat sabit. Mikro alımlarla (ortalama $${(transactions.reduce((sum, tx) => sum + (tx.amountInUsd || 0), 0) / transactions.length).toFixed(2)}) trending listelerini manipüle etmeye çalışıyorlar - sahte hype riski`
      );
    }
  }

  // 14. DIAMOND HANDS & SMART MONEY (Conviction Score) - Early holders still holding
  // timeRange and timeRangeDays already calculated above
  // Detect wallets that bought early and haven't sold (or only added more)
  if (transactions.length > 50 && timeRangeDays > 0) {
    const earlyBuyers = new Map<string, { firstBuy: number; lastBuy: number; totalBought: number; hasSold: boolean }>();
    // Sort transactions by timestamp (oldest first) for early buyer detection
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
    const earlyThreshold = sortedTxs.length > 10 ? sortedTxs[Math.floor(sortedTxs.length * 0.1)].timestamp : sortedTxs[sortedTxs.length - 1].timestamp; // First 10% of transactions
    
    sortedTxs.forEach(tx => {
      if (tx.direction === 'buy' && tx.timestamp <= earlyThreshold) {
        const existing = earlyBuyers.get(tx.wallet) || { firstBuy: tx.timestamp, lastBuy: tx.timestamp, totalBought: 0, hasSold: false };
        existing.firstBuy = Math.min(existing.firstBuy, tx.timestamp);
        existing.lastBuy = Math.max(existing.lastBuy, tx.timestamp);
        existing.totalBought += tx.amountOutUsd || 0;
        earlyBuyers.set(tx.wallet, existing);
      } else if (tx.direction === 'sell' && earlyBuyers.has(tx.wallet)) {
        const existing = earlyBuyers.get(tx.wallet)!;
        existing.hasSold = true;
      }
    });

    const diamondHands = Array.from(earlyBuyers.values()).filter(w => !w.hasSold);
    const diamondHandsPercent = earlyBuyers.size > 0 ? (diamondHands.length / earlyBuyers.size) * 100 : 0;
    const diamondHandsVolume = diamondHands.reduce((sum, w) => sum + w.totalBought, 0);
    const totalEarlyVolume = Array.from(earlyBuyers.values()).reduce((sum, w) => sum + w.totalBought, 0);
    const diamondHandsVolumePercent = totalEarlyVolume > 0 ? (diamondHandsVolume / totalEarlyVolume) * 100 : 0;

    if (diamondHandsPercent > 50 && diamondHandsVolumePercent > 30) {
      suspiciousPatterns.push(
        `💎 DIAMOND HANDS: Erken giren 'Alpha' cüzdanların ${diamondHandsPercent.toFixed(0)}%'i hala içeride (satış yapmamış). Erken yatırım hacminin ${diamondHandsVolumePercent.toFixed(1)}%'i tutuluyor. Projeye inanç yüksek - uzun vadeli potansiyel göstergesi`
      );
    } else if (diamondHandsPercent < 20) {
      suspiciousPatterns.push(
        `⚠️ ERKEN ÇIKIŞ: Erken giren cüzdanların ${((1 - diamondHandsPercent / 100) * 100).toFixed(0)}%'i zaten satış yaptı. İçeriden bilgi alanlar (insiders) erken çıkmış olabilir`
      );
    }
  }

  // 15. FOMO vs. PANIK HIZ GÖSTERGESİ (Velocity Sentiment) - Transaction velocity acceleration
  // Detect sudden spikes in transaction frequency (panic or FOMO)
  if (transactions.length > 100) {
    // Calculate transaction velocity (transactions per minute) in time windows
    const windowSize = 60 * 1000; // 1 minute
    const velocityWindows: number[] = [];
    const windows = new Map<number, ParsedSwap[]>();
    
    transactions.forEach(tx => {
      const window = Math.floor(tx.timestamp / windowSize) * windowSize;
      if (!windows.has(window)) {
        windows.set(window, []);
      }
      windows.get(window)!.push(tx);
    });

    // Calculate velocity for each window
    Array.from(windows.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([_, txs]) => {
        velocityWindows.push(txs.length); // Transactions per minute
      });

    // Detect velocity spikes (sudden acceleration)
    if (velocityWindows.length > 10) {
      const avgVelocity = velocityWindows.reduce((a, b) => a + b, 0) / velocityWindows.length;
      const recentVelocity = velocityWindows.slice(-5).reduce((a, b) => a + b, 0) / 5; // Last 5 minutes
      const velocityRatio = avgVelocity > 0 ? recentVelocity / avgVelocity : 1;

      // Check if price is moving opposite to velocity (panic selling)
      const recentTxs = transactions.slice(0, Math.min(50, transactions.length));
      const oldestPrice = recentTxs[recentTxs.length - 1]?.priceToken;
      const newestPrice = recentTxs[0]?.priceToken;
      const priceChange = oldestPrice && newestPrice && oldestPrice > 0 
        ? ((newestPrice - oldestPrice) / oldestPrice) * 100 
        : 0;

      if (velocityRatio > 3 && priceChange < -5) {
        suspiciousPatterns.push(
          `🚨 PANIK SATIŞI: İşlem hızı son 5 dakikada ${velocityRatio.toFixed(1)}x arttı + Fiyat ${Math.abs(priceChange).toFixed(1)}% düştü = PANIC SELL başladı. Şelale düşüşü (cascade) riski yüksek`
        );
      } else if (velocityRatio > 3 && priceChange > 10) {
        suspiciousPatterns.push(
          `📈 FOMO PATLAMASI: İşlem hızı ${velocityRatio.toFixed(1)}x arttı + Fiyat ${priceChange.toFixed(1)}% yükseldi = FOMO (Fear of Missing Out) başladı. Aşırı alım (overbought) riski`
        );
      }
    }
  }

  // 16. TAZE KAN GİRİŞİ (New Wallet Flow) - Unique new wallets entering
  // Detect if new wallets (never seen before) are driving volume
  if (transactions.length > 50) {
    // Sort transactions by time (oldest first for this analysis)
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
    const seenWallets = new Set<string>();
    const newWalletTxs: ParsedSwap[] = [];
    const oldWalletTxs: ParsedSwap[] = [];
    
    sortedTxs.forEach(tx => {
      if (seenWallets.has(tx.wallet)) {
        oldWalletTxs.push(tx);
      } else {
        seenWallets.add(tx.wallet);
        newWalletTxs.push(tx);
      }
    });

    const newWalletCount = newWalletTxs.length;
    const newWalletVolume = newWalletTxs.reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
    const newWalletVolumePercent = totalUsdVolume > 0 ? (newWalletVolume / totalUsdVolume) * 100 : 0;
    const newWalletTxPercent = totalCount > 0 ? (newWalletCount / totalCount) * 100 : 0;

    // Focus on recent transactions (last 20% of time range)
    const recentThreshold = sortedTxs[Math.floor(sortedTxs.length * 0.8)].timestamp;
    const recentNewWallets = newWalletTxs.filter(tx => tx.timestamp >= recentThreshold);
    const recentNewWalletVolume = recentNewWallets.reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
    const recentNewWalletVolumePercent = totalUsdVolume > 0 ? (recentNewWalletVolume / totalUsdVolume) * 100 : 0;

    if (recentNewWalletVolumePercent > 50 && newWalletTxPercent > 60) {
      suspiciousPatterns.push(
          `🆕 New Wallet Activity: ${newWalletTxPercent.toFixed(0)}% of recent buyers are new wallets (previously unseen). ${recentNewWalletVolumePercent.toFixed(1)}% of volume comes from new investors. Project is expanding beyond its ecosystem and going viral - organic growth indicator`
      );
    } else if (newWalletVolumePercent < 20 && newWalletTxPercent < 30) {
      suspiciousPatterns.push(
        `🔄 KAPALI DÖNGÜ: Hacmin ${((1 - newWalletVolumePercent / 100) * 100).toFixed(0)}%'i mevcut cüzdanlardan geliyor. Token kendi içinde dönüyor, dışarıdan yatırımcı çekemiyor - organik büyüme yok`
      );
    }
  }

  // Build top wallets list
  const topWallets: WalletActivity[] = Array.from(walletMap.values())
    .sort((a, b) => {
      // Sort by USD volume if available, otherwise by raw volume
      if (a.volumeUSD !== undefined && b.volumeUSD !== undefined) {
        return b.volumeUSD - a.volumeUSD;
      }
      return Number(b.totalVolume - a.totalVolume);
    })
    .slice(0, 10)
    .map((w) => {
      const volumeShare = totalVolume > BigInt(0) 
        ? Number((w.totalVolume * BigInt(10000)) / totalVolume) / 100
        : 0;
      
      return {
        address: w.address,
        txCount: w.transactionCount,
        totalVolume: w.totalVolume,
        volumeShare,
        volumeUSD: w.volumeUSD,
        firstSeen: w.firstSeen,
        lastSeen: w.lastSeen,
      };
    });

  // Build top traders list (with buy/sell breakdown)
  const topTraders: TopTrader[] = Array.from(walletMap.values())
    .sort((a, b) => Number(b.totalVolume - a.totalVolume))
    .slice(0, 5)
    .map((w) => ({
      wallet: w.address,
      buyCount: w.buyCount,
      sellCount: w.sellCount,
      volume: Number(w.totalVolume) / 1e9, // Convert to readable units
    }));

  // ============================================================================
  // DETAILED WALLET BEHAVIOR ANALYSIS (For AI Prompt)
  // ============================================================================
  
  // Find high-value buyers (wallets with large buy transactions)
  const highValueBuyers: Array<{
    address: string;
    totalBuyVolume: number;
    buyCount: number;
    avgBuySize: number;
    largestBuy: number;
    lastBuyTime: number;
    hasSoldAfterBuy: boolean;
    sellAfterBuyCount: number;
  }> = [];
  
  // Find high-value sellers (wallets with large sell transactions)
  const highValueSellers: Array<{
    address: string;
    totalSellVolume: number;
    sellCount: number;
    avgSellSize: number;
    largestSell: number;
    lastSellTime: number;
    hasBoughtAfterSell: boolean;
    buyAfterSellCount: number;
  }> = [];

  // Calculate average transaction size for threshold
  const avgTxSize = avgVolumeUSD;
  const highValueThreshold = avgTxSize * 5; // 5x average = high value

  // Analyze each wallet's behavior
  walletMap.forEach((wallet, address) => {
    // Get all transactions for this wallet, sorted by time
    const walletTxs = transactions
      .filter(tx => tx.wallet === address)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Analyze buy behavior
    const buyTxs = walletTxs.filter(tx => tx.direction === 'buy');
    const buyVolumes = buyTxs.map(tx => tx.amountInUsd || tx.amountOutUsd || 0);
    const totalBuyVolume = buyVolumes.reduce((sum, v) => sum + v, 0);
    const largestBuy = buyVolumes.length > 0 ? Math.max(...buyVolumes) : 0;

    if (totalBuyVolume > highValueThreshold && buyTxs.length > 0) {
      const lastBuy = buyTxs[buyTxs.length - 1];
      const sellsAfterLastBuy = walletTxs.filter(tx => 
        tx.direction === 'sell' && tx.timestamp > lastBuy.timestamp
      );
      
      highValueBuyers.push({
        address,
        totalBuyVolume,
        buyCount: buyTxs.length,
        avgBuySize: totalBuyVolume / buyTxs.length,
        largestBuy,
        lastBuyTime: lastBuy.timestamp,
        hasSoldAfterBuy: sellsAfterLastBuy.length > 0,
        sellAfterBuyCount: sellsAfterLastBuy.length,
      });
    }

    // Analyze sell behavior
    const sellTxs = walletTxs.filter(tx => tx.direction === 'sell');
    const sellVolumes = sellTxs.map(tx => tx.amountInUsd || tx.amountOutUsd || 0);
    const totalSellVolume = sellVolumes.reduce((sum, v) => sum + v, 0);
    const largestSell = sellVolumes.length > 0 ? Math.max(...sellVolumes) : 0;

    if (totalSellVolume > highValueThreshold && sellTxs.length > 0) {
      const lastSell = sellTxs[sellTxs.length - 1];
      const buysAfterLastSell = walletTxs.filter(tx => 
        tx.direction === 'buy' && tx.timestamp > lastSell.timestamp
      );
      
      highValueSellers.push({
        address,
        totalSellVolume,
        sellCount: sellTxs.length,
        avgSellSize: totalSellVolume / sellTxs.length,
        largestSell,
        lastSellTime: lastSell.timestamp,
        hasBoughtAfterSell: buysAfterLastSell.length > 0,
        buyAfterSellCount: buysAfterLastSell.length,
      });
    }
  });

  // Sort by volume
  highValueBuyers.sort((a, b) => b.totalBuyVolume - a.totalBuyVolume);
  highValueSellers.sort((a, b) => b.totalSellVolume - a.totalSellVolume);

  // ✅ YENİ: Cüzdan istatistikleri hesapla
  const diamondHandsCount = highValueBuyers.filter(w => !w.hasSoldAfterBuy).length;
  const diamondHandsBuyers = highValueBuyers.filter(w => !w.hasSoldAfterBuy);
  const diamondHandsTotalVolume = diamondHandsBuyers.reduce((sum, w) => sum + w.totalBuyVolume, 0);
  
  const reEntryCount = highValueSellers.filter(w => w.hasBoughtAfterSell).length;
  const reEntrySellers = highValueSellers.filter(w => w.hasBoughtAfterSell);
  const reEntryTotalSellVolume = reEntrySellers.reduce((sum, w) => sum + w.totalSellVolume, 0);
  const reEntryTotalBuyBackVolume = reEntrySellers.reduce((sum, w) => {
    const walletTxs = transactions
      .filter(tx => tx.wallet === w.address)
      .sort((a, b) => a.timestamp - b.timestamp);
    const lastSell = walletTxs.filter(tx => tx.direction === 'sell').sort((a, b) => b.timestamp - a.timestamp)[0];
    if (lastSell) {
      const buysAfterLastSell = walletTxs.filter(tx => 
        tx.direction === 'buy' && tx.timestamp > lastSell.timestamp
      );
      return sum + buysAfterLastSell.reduce((vol, tx) => vol + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
    }
    return sum;
  }, 0);
  
  const totalHighValueWallets = new Set([
    ...highValueBuyers.map(w => w.address),
    ...highValueSellers.map(w => w.address)
  ]).size;
  
  // ✅ YENİ: Taze kan girişi - İlk kez görülen wallet'ları tespit et
  const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const seenWallets = new Set<string>();
  let newWalletTxCount = 0;
  sortedTxs.forEach(tx => {
    if (!seenWallets.has(tx.wallet)) {
      seenWallets.add(tx.wallet);
      newWalletTxCount++;
    }
  });
  const newWalletRatio = totalCount > 0 ? (newWalletTxCount / totalCount) * 100 : 0;
  
  // ✅ YENİ: Manipülasyon tespiti - Aynı anda yüksek miktarda alım yapıp aynı anda satış yapan cüzdanlar
  // Time window: 5 dakika içinde hem büyük alım hem büyük satış yapan cüzdanlar
  const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 dakika
  const manipulationWallets = new Set<string>();
  
  walletMap.forEach((wallet, address) => {
    const walletTxs = transactions
      .filter(tx => tx.wallet === address)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Her alım için, 5 dakika içinde büyük satış var mı kontrol et
    walletTxs.forEach(tx => {
      if (tx.direction === 'buy' && (tx.amountInUsd || tx.amountOutUsd || 0) > avgVolumeUSD * 3) {
        const buyTime = tx.timestamp;
        const sellsInWindow = walletTxs.filter(sellTx => 
          sellTx.direction === 'sell' &&
          sellTx.timestamp > buyTime &&
          sellTx.timestamp <= buyTime + TIME_WINDOW_MS &&
          (sellTx.amountInUsd || sellTx.amountOutUsd || 0) > avgVolumeUSD * 3
        );
        
        if (sellsInWindow.length > 0) {
          manipulationWallets.add(address);
        }
      }
    });
  });
  
  const manipulationWalletsCount = manipulationWallets.size;
  const manipulationRatio = walletMap.size > 0 ? (manipulationWalletsCount / walletMap.size) * 100 : 0;
  
  // ✅ YENİ: Wash trading yapan cüzdanların toplam hacmi ve fiyat etkisi
  let manipulationTotalVolume = 0;
  let manipulationBuyVolume = 0;
  let manipulationSellVolume = 0;
  const manipulationWalletAddresses: string[] = [];
  const manipulationDetails: Array<{
    address: string;
    buyVolume: number;
    sellVolume: number;
    buyCount: number;
    sellCount: number;
    timeWindow: number; // Ortalama alım-satım arası süre (ms)
  }> = [];
  
  if (manipulationWallets.size > 0) {
    manipulationWallets.forEach(address => {
      manipulationWalletAddresses.push(address);
      const walletTxs = transactions
        .filter(tx => tx.wallet === address)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      let walletBuyVolume = 0;
      let walletSellVolume = 0;
      let walletBuyCount = 0;
      let walletSellCount = 0;
      const buySellPairs: Array<{ buyTime: number; sellTime: number }> = [];
      
      // Wash trading çiftlerini tespit et
      walletTxs.forEach((tx, idx) => {
        const txVolume = tx.amountInUsd || tx.amountOutUsd || 0;
        manipulationTotalVolume += txVolume;
        
        if (tx.direction === 'buy' && txVolume > avgVolumeUSD * 3) {
          walletBuyVolume += txVolume;
          walletBuyCount++;
          
          // Bu alımdan sonra 5 dakika içinde satış var mı?
          const sellsInWindow = walletTxs.filter(sellTx => 
            sellTx.direction === 'sell' &&
            sellTx.timestamp > tx.timestamp &&
            sellTx.timestamp <= tx.timestamp + TIME_WINDOW_MS &&
            (sellTx.amountInUsd || sellTx.amountOutUsd || 0) > avgVolumeUSD * 3
          );
          
          if (sellsInWindow.length > 0) {
            sellsInWindow.forEach(sell => {
              buySellPairs.push({
                buyTime: tx.timestamp,
                sellTime: sell.timestamp,
              });
            });
          }
        } else if (tx.direction === 'sell' && txVolume > avgVolumeUSD * 3) {
          walletSellVolume += txVolume;
          walletSellCount++;
        }
      });
      
      const avgTimeWindow = buySellPairs.length > 0
        ? buySellPairs.reduce((sum, pair) => sum + (pair.sellTime - pair.buyTime), 0) / buySellPairs.length
        : 0;
      
      manipulationDetails.push({
        address,
        buyVolume: walletBuyVolume,
        sellVolume: walletSellVolume,
        buyCount: walletBuyCount,
        sellCount: walletSellCount,
        timeWindow: avgTimeWindow,
      });
      
      manipulationBuyVolume += walletBuyVolume;
      manipulationSellVolume += walletSellVolume;
    });
  }
  
  const manipulationVolumePercent = totalUsdVolume > 0 ? (manipulationTotalVolume / totalUsdVolume) * 100 : 0;
  const manipulationBuyVolumePercent = buyVolumeUSD > 0 ? (manipulationBuyVolume / buyVolumeUSD) * 100 : 0;
  const manipulationSellVolumePercent = sellVolumeUSD > 0 ? (manipulationSellVolume / sellVolumeUSD) * 100 : 0;
  
  // ✅ YENİ: Manipülasyonun fiyat etkisi tahmini
  // Basit heuristik: Alım hacmi fiyat yükselişi, satış hacmi fiyat düşüşü yaratır
  // Likiditeye göre normalize et
  const liquidityUSD = reserves?.tvlUSD || 0;
  const estimatedPriceImpactFromManipulationBuy = liquidityUSD > 0 
    ? (manipulationBuyVolume / liquidityUSD) * 100 
    : 0;
  const estimatedPriceImpactFromManipulationSell = liquidityUSD > 0
    ? (manipulationSellVolume / liquidityUSD) * 100
    : 0;
  
  // ✅ YENİ: FOMO/Panik tespiti - İşlem hızı ve fiyat hareketi analizi
  // Son %20 işlemi analiz et (recent activity)
  const recentThreshold = sortedTxs.length > 0 
    ? sortedTxs[Math.floor(sortedTxs.length * 0.8)].timestamp 
    : 0;
  const recentTxs = transactions.filter(tx => tx.timestamp >= recentThreshold);
  const olderTxs = transactions.filter(tx => tx.timestamp < recentThreshold);
  
  // İşlem hızı (transactions per hour)
  const recentTimeSpan = recentTxs.length > 0 
    ? (Math.max(...recentTxs.map(tx => tx.timestamp)) - Math.min(...recentTxs.map(tx => tx.timestamp))) / (1000 * 60 * 60)
    : 1;
  const olderTimeSpan = olderTxs.length > 0
    ? (Math.max(...olderTxs.map(tx => tx.timestamp)) - Math.min(...olderTxs.map(tx => tx.timestamp))) / (1000 * 60 * 60)
    : 1;
  
  const recentVelocity = recentTimeSpan > 0 ? recentTxs.length / recentTimeSpan : 0;
  const olderVelocity = olderTimeSpan > 0 ? olderTxs.length / olderTimeSpan : 0;
  const velocitySpike = olderVelocity > 0 ? recentVelocity / olderVelocity : 1;
  
  // Hacim artışı
  const recentBuyVolume = recentTxs
    .filter(tx => tx.direction === 'buy')
    .reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
  const recentSellVolume = recentTxs
    .filter(tx => tx.direction === 'sell')
    .reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
  const olderBuyVolume = olderTxs
    .filter(tx => tx.direction === 'buy')
    .reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
  const olderSellVolume = olderTxs
    .filter(tx => tx.direction === 'sell')
    .reduce((sum, tx) => sum + (tx.amountInUsd || tx.amountOutUsd || 0), 0);
  
  const buyVolumeSpike = olderBuyVolume > 0 ? recentBuyVolume / olderBuyVolume : 1;
  const sellVolumeSpike = olderSellVolume > 0 ? recentSellVolume / olderSellVolume : 1;
  
  // Fiyat hareketi tahmini (basit: buy/sell ratio değişimi)
  const recentBuyRatio = recentTxs.length > 0 
    ? recentTxs.filter(tx => tx.direction === 'buy').length / recentTxs.length 
    : 0.5;
  const olderBuyRatio = olderTxs.length > 0
    ? olderTxs.filter(tx => tx.direction === 'buy').length / olderTxs.length
    : 0.5;
  const priceRise = (recentBuyRatio - olderBuyRatio) * 100; // Pozitif = fiyat artışı
  const priceDrop = (olderBuyRatio - recentBuyRatio) * 100; // Pozitif = fiyat düşüşü
  
  const panicSellIndicators = {
    velocitySpike,
    priceDrop: priceDrop > 0 ? priceDrop : 0,
    sellVolumeSpike,
  };
  
  const fomoBuyIndicators = {
    velocitySpike,
    priceRise: priceRise > 0 ? priceRise : 0,
    buyVolumeSpike,
  };
  
  // ============================================================================
  // ✅ YENİ: 1. SMART MONEY ENTRY PRICE ANALYSIS
  // ============================================================================
  let smartMoneyAnalysis: any = undefined;
  if (transactions.length > 50 && transactions.some(tx => tx.priceToken && tx.priceToken > 0)) {
    // Get current price (most recent transaction price)
    const sortedByTime = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    const currentPrice = sortedByTime.find(tx => tx.priceToken && tx.priceToken > 0)?.priceToken || 0;
    
    if (currentPrice > 0) {
      // Identify early buyers (first 10% of transactions)
      const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
      const earlyThresholdIndex = Math.floor(sortedTxs.length * 0.1);
      const earlyThresholdTime = sortedTxs[earlyThresholdIndex]?.timestamp || sortedTxs[0]?.timestamp;
      
      const earlyBuyers = new Map<string, {
        entryPrices: number[];
        volumes: number[];
        totalVolume: number;
        hasSold: boolean;
      }>();
      
      sortedTxs.forEach(tx => {
        if (tx.direction === 'buy' && tx.timestamp <= earlyThresholdTime && tx.priceToken && tx.priceToken > 0) {
          const existing = earlyBuyers.get(tx.wallet) || {
            entryPrices: [],
            volumes: [],
            totalVolume: 0,
            hasSold: false,
          };
          existing.entryPrices.push(tx.priceToken);
          const txVolume = tx.amountInUsd || tx.amountOutUsd || 0;
          existing.volumes.push(txVolume);
          existing.totalVolume += txVolume;
          earlyBuyers.set(tx.wallet, existing);
        } else if (tx.direction === 'sell' && earlyBuyers.has(tx.wallet)) {
          const existing = earlyBuyers.get(tx.wallet)!;
          existing.hasSold = true;
        }
      });
      
      if (earlyBuyers.size > 0) {
        // Calculate weighted average entry price for each early buyer
        let totalEntryPrice = 0;
        let totalVolume = 0;
        let stillHoldingCount = 0;
        let stillHoldingVolume = 0;
        
        earlyBuyers.forEach((buyer, address) => {
          // Weighted average entry price
          let weightedPrice = 0;
          let totalWeight = 0;
          buyer.entryPrices.forEach((price, idx) => {
            const weight = buyer.volumes[idx] || 0;
            weightedPrice += price * weight;
            totalWeight += weight;
          });
          const avgEntryPrice = totalWeight > 0 ? weightedPrice / totalWeight : 0;
          
          if (avgEntryPrice > 0) {
            totalEntryPrice += avgEntryPrice * buyer.totalVolume;
            totalVolume += buyer.totalVolume;
            
            if (!buyer.hasSold) {
              stillHoldingCount++;
              stillHoldingVolume += buyer.totalVolume;
            }
          }
        });
        
        const avgEntryPrice = totalVolume > 0 ? totalEntryPrice / totalVolume : 0;
        const profitLossPercent = avgEntryPrice > 0 ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 : 0;
        const stillHoldingRatio = earlyBuyers.size > 0 ? (stillHoldingCount / earlyBuyers.size) * 100 : 0;
        
        smartMoneyAnalysis = {
          earlyBuyersCount: earlyBuyers.size,
          earlyBuyersAvgEntryPrice: avgEntryPrice,
          earlyBuyersCurrentProfitLoss: profitLossPercent,
          earlyBuyersTotalVolume: totalVolume,
          earlyBuyersStillHolding: stillHoldingCount,
          earlyBuyersStillHoldingRatio: stillHoldingRatio,
        };
      }
    }
  }
  
  // ============================================================================
  // ✅ YENİ: 4. PROFIT/LOSS DISTRIBUTION ANALYSIS
  // ============================================================================
  let profitLossDistribution: any = undefined;
  if (transactions.length > 50 && transactions.some(tx => tx.priceToken && tx.priceToken > 0)) {
    const sortedByTime = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    const currentPrice = sortedByTime.find(tx => tx.priceToken && tx.priceToken > 0)?.priceToken || 0;
    
    if (currentPrice > 0) {
      // Calculate entry price for each wallet (weighted average)
      const walletEntryPrices = new Map<string, {
        entryPrices: number[];
        volumes: number[];
        totalVolume: number;
        hasSold: boolean;
      }>();
      
      const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
      sortedTxs.forEach(tx => {
        if (tx.direction === 'buy' && tx.priceToken && tx.priceToken > 0) {
          const existing = walletEntryPrices.get(tx.wallet) || {
            entryPrices: [],
            volumes: [],
            totalVolume: 0,
            hasSold: false,
          };
          existing.entryPrices.push(tx.priceToken);
          const txVolume = tx.amountInUsd || tx.amountOutUsd || 0;
          existing.volumes.push(txVolume);
          existing.totalVolume += txVolume;
          walletEntryPrices.set(tx.wallet, existing);
        } else if (tx.direction === 'sell' && walletEntryPrices.has(tx.wallet)) {
          const existing = walletEntryPrices.get(tx.wallet)!;
          existing.hasSold = true;
        }
      });
      
      let walletsInProfit = 0;
      let walletsInLoss = 0;
      let walletsAtBreakEven = 0;
      let totalProfitVolume = 0;
      let totalLossVolume = 0;
      const profitPercents: number[] = [];
      const lossPercents: number[] = [];
      
      walletEntryPrices.forEach((buyer) => {
        if (buyer.totalVolume > 0 && buyer.entryPrices.length > 0) {
          // Calculate weighted average entry price
          let weightedPrice = 0;
          let totalWeight = 0;
          buyer.entryPrices.forEach((price, idx) => {
            const weight = buyer.volumes[idx] || 0;
            weightedPrice += price * weight;
            totalWeight += weight;
          });
          const avgEntryPrice = totalWeight > 0 ? weightedPrice / totalWeight : 0;
          
          if (avgEntryPrice > 0) {
            const profitLossPercent = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;
            
            if (profitLossPercent > 1) {
              // In profit (>1% threshold)
              walletsInProfit++;
              totalProfitVolume += buyer.totalVolume;
              profitPercents.push(profitLossPercent);
            } else if (profitLossPercent < -1) {
              // In loss (<-1% threshold)
              walletsInLoss++;
              totalLossVolume += buyer.totalVolume;
              lossPercents.push(Math.abs(profitLossPercent));
            } else {
              // At break-even
              walletsAtBreakEven++;
            }
          }
        }
      });
      
      const totalWallets = walletEntryPrices.size;
      const profitLossRatio = totalWallets > 0 ? (walletsInProfit / totalWallets) * 100 : 0;
      const avgProfitPercent = profitPercents.length > 0 
        ? profitPercents.reduce((sum, p) => sum + p, 0) / profitPercents.length 
        : 0;
      const avgLossPercent = lossPercents.length > 0
        ? lossPercents.reduce((sum, p) => sum + p, 0) / lossPercents.length
        : 0;
      
      // Determine profit-taking risk
      let profitTakingRisk: 'low' | 'medium' | 'high' = 'low';
      if (profitLossRatio > 70 && avgProfitPercent > 50) {
        profitTakingRisk = 'high'; // Most wallets in profit with high gains
      } else if (profitLossRatio > 50 && avgProfitPercent > 30) {
        profitTakingRisk = 'medium';
      }
      
      profitLossDistribution = {
        walletsInProfit,
        walletsInLoss,
        walletsAtBreakEven,
        profitLossRatio,
        avgProfitPercent,
        avgLossPercent,
        totalProfitVolume,
        totalLossVolume,
        profitTakingRisk,
      };
    }
  }
  
  // ============================================================================
  // ✅ YENİ: 8. SUPPORT/RESISTANCE LEVEL DETECTION
  // ============================================================================
  let supportResistanceLevels: any = undefined;
  if (transactions.length > 100 && transactions.some(tx => tx.priceToken && tx.priceToken > 0)) {
    const sortedByTime = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    const currentPrice = sortedByTime.find(tx => tx.priceToken && tx.priceToken > 0)?.priceToken || 0;
    
    if (currentPrice > 0) {
      // Create price histogram (group transactions by price ranges)
      const priceBins = new Map<number, { count: number; volume: number; prices: number[] }>();
      const PRICE_BIN_SIZE = currentPrice * 0.02; // 2% price bins
      
      transactions.forEach(tx => {
        if (tx.priceToken && tx.priceToken > 0) {
          const bin = Math.round(tx.priceToken / PRICE_BIN_SIZE) * PRICE_BIN_SIZE;
          const existing = priceBins.get(bin) || { count: 0, volume: 0, prices: [] };
          existing.count++;
          existing.volume += tx.amountInUsd || tx.amountOutUsd || 0;
          existing.prices.push(tx.priceToken);
          priceBins.set(bin, existing);
        }
      });
      
      // Find support levels (price levels with high transaction count below current price)
      const supportLevels: Array<{ price: number; transactionCount: number; volume: number; strength: 'weak' | 'moderate' | 'strong' }> = [];
      const resistanceLevels: Array<{ price: number; transactionCount: number; volume: number; strength: 'weak' | 'moderate' | 'strong' }> = [];
      
      // Calculate average transaction count and volume for strength determination
      const allCounts = Array.from(priceBins.values()).map(b => b.count);
      const avgCount = allCounts.length > 0 ? allCounts.reduce((sum, c) => sum + c, 0) / allCounts.length : 0;
      const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 0;
      
      priceBins.forEach((bin, price) => {
        if (price < currentPrice) {
          // Support level (below current price)
          let strength: 'weak' | 'moderate' | 'strong' = 'weak';
          if (bin.count > avgCount * 1.5 && bin.count > maxCount * 0.3) {
            strength = 'strong';
          } else if (bin.count > avgCount * 1.2) {
            strength = 'moderate';
          }
          
          if (bin.count > avgCount * 1.1) {
            supportLevels.push({
              price,
              transactionCount: bin.count,
              volume: bin.volume,
              strength,
            });
          }
        } else if (price > currentPrice) {
          // Resistance level (above current price)
          let strength: 'weak' | 'moderate' | 'strong' = 'weak';
          if (bin.count > avgCount * 1.5 && bin.count > maxCount * 0.3) {
            strength = 'strong';
          } else if (bin.count > avgCount * 1.2) {
            strength = 'moderate';
          }
          
          if (bin.count > avgCount * 1.1) {
            resistanceLevels.push({
              price,
              transactionCount: bin.count,
              volume: bin.volume,
              strength,
            });
          }
        }
      });
      
      // Sort by transaction count (descending) and take top 5
      supportLevels.sort((a, b) => b.transactionCount - a.transactionCount);
      resistanceLevels.sort((a, b) => b.transactionCount - a.transactionCount);
      
      // Find nearest support and resistance
      const nearestSupport = supportLevels.length > 0 
        ? supportLevels.reduce((nearest, level) => 
            level.price > nearest.price ? level : nearest
          , supportLevels[0])
        : undefined;
      
      const nearestResistance = resistanceLevels.length > 0
        ? resistanceLevels.reduce((nearest, level) =>
            level.price < nearest.price ? level : nearest
          , resistanceLevels[0])
        : undefined;
      
      supportResistanceLevels = {
        supportLevels: supportLevels.slice(0, 5), // Top 5 support levels
        resistanceLevels: resistanceLevels.slice(0, 5), // Top 5 resistance levels
        currentPrice,
        nearestSupport: nearestSupport?.price,
        nearestResistance: nearestResistance?.price,
      };
    }
  }

  const walletStats = {
    diamondHandsCount,
    reEntryCount,
    diamondHandsRatio: highValueBuyers.length > 0 ? (diamondHandsCount / highValueBuyers.length) * 100 : 0,
    reEntryRatio: highValueSellers.length > 0 ? (reEntryCount / highValueSellers.length) * 100 : 0,
    totalHighValueWallets,
    newWalletRatio,
    manipulationWallets: manipulationWalletsCount,
    manipulationRatio,
    manipulationTotalVolume,
    manipulationVolumePercent,
    manipulationBuyVolume,
    manipulationBuyVolumePercent,
    manipulationSellVolume,
    manipulationSellVolumePercent,
    manipulationWalletAddresses,
    estimatedPriceImpactFromManipulationBuy,
    estimatedPriceImpactFromManipulationSell,
    diamondHandsTotalVolume,
    reEntryTotalSellVolume,
    reEntryTotalBuyBackVolume,
    panicSellIndicators,
    fomoBuyIndicators,
    smartMoneyAnalysis, // ✅ YENİ
    profitLossDistribution, // ✅ YENİ
    supportResistanceLevels, // ✅ YENİ
  };

  // Calculate liquidity-to-transaction ratios
  // ✅ DÜZELTME: liquidityUSD zaten yukarıda tanımlanmış (satır 1053), tekrar tanımlamaya gerek yok
  const largeBuyRatio = highValueBuyers.length > 0 && liquidityUSD > 0
    ? highValueBuyers.reduce((sum, w) => sum + w.largestBuy, 0) / liquidityUSD * 100
    : 0;
  const largeSellRatio = highValueSellers.length > 0 && liquidityUSD > 0
    ? highValueSellers.reduce((sum, w) => sum + w.largestSell, 0) / liquidityUSD * 100
    : 0;

  // Time range already calculated above (in ADVANCED FORENSIC PATTERNS section)

  // Generate summary text
  const summary = `Analyzed ${totalCount} transactions: ${buyCount} buys (${((buyCount / totalCount) * 100).toFixed(1)}%), ${sellCount} sells (${((sellCount / totalCount) * 100).toFixed(1)}%). ${walletMap.size} unique wallets. ${suspiciousPatterns.length} suspicious patterns detected.`;

  return {
    totalCount,
    totalTransactions: totalCount,
    buyCount,
    sellCount,
    avgVolumeUSD,
    uniqueWallets: walletMap.size,
    totalVolumeUSD: totalUsdVolume,
    buyVolumeUSD, // ✅ DÜZELTME: Buy volume eklendi
    sellVolumeUSD, // ✅ DÜZELTME: Sell volume eklendi
    walletStats, // ✅ YENİ: Cüzdan istatistikleri
    topWallets,
    topTraders,
    suspiciousPatterns,
    summary,
    timeRange,
    highValueBuyers: highValueBuyers.slice(0, 10), // Top 10 high-value buyers
    highValueSellers: highValueSellers.slice(0, 10), // Top 10 high-value sellers
    largeBuyRatio,
    largeSellRatio,
  };
}

/**
 * Simplified transaction analysis (for when full parsing fails)
 * Uses heuristics based on transaction signatures
 */
export function simplifiedTransactionAnalysis(
  signatures: Array<{ signature: string; blockTime?: number | null; err?: any }>
): TransactionSummary {
  const validTxs = signatures.filter(sig => !sig.err);
  const totalCount = validTxs.length;

  // Fallback: use mock ratios but log warning
  console.warn('[TransactionParser] ⚠️ Using simplified analysis (full parsing unavailable)');

  const buyCount = Math.floor(totalCount * 0.6);
  const sellCount = totalCount - buyCount;

  const timeRange = validTxs.length > 0 ? {
    earliest: new Date((validTxs[validTxs.length - 1]?.blockTime || 0) * 1000),
    latest: new Date((validTxs[0]?.blockTime || 0) * 1000),
  } : undefined;

  return {
    totalCount,
    totalTransactions: totalCount,
    buyCount,
    sellCount,
    avgVolumeUSD: 0,
    uniqueWallets: 0,
    topWallets: [],
    topTraders: [],
    suspiciousPatterns: ['Unable to perform detailed analysis - using simplified heuristics'],
    summary: `Simplified analysis: ${totalCount} transactions (estimated ${buyCount} buys, ${sellCount} sells). Full transaction parsing unavailable.`,
    timeRange,
  };
}

