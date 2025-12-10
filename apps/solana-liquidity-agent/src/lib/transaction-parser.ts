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
  transactions: ParsedSwap[]
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
  const totalUsdVolume = transactions
    .filter(tx => tx.amountInUsd !== undefined)
    .reduce((sum, tx) => sum + (tx.amountInUsd || 0), 0);
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
          `⚠️ MAFYA KÜMESİ: ${clusterWallets.size} cüzdan aynı saniyelerde senkronize hareket ediyor. Hacmin ${clusterVolumePercent.toFixed(1)}%'i koordineli işlemlerden oluşuyor - yapay yükseliş riski`
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
        `🆕 TAZE KAN GİRİŞİ: Son zamanlardaki alıcıların ${newWalletTxPercent.toFixed(0)}%'i taze cüzdanlar (daha önce görülmemiş). Hacmin ${recentNewWalletVolumePercent.toFixed(1)}%'i yeni yatırımcılardan geliyor. Proje kendi ekosisteminden çıkıp virale gidiyor - organik büyüme göstergesi`
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
    topWallets,
    topTraders,
    suspiciousPatterns,
    summary,
    timeRange,
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

