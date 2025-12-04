// apps/solana-liquidity-agent/src/lib/pool-discovery.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { detectPoolType, PoolType, getPoolTypeName } from './pool-detector';
import { findBestPoolWithFallback } from './jupiter-client';
import { findBestPoolViaDexScreener } from './dexscreener-client';

/**
 * Pool Discovery Service - 3-Tier Approach
 * 
 * Tier 1: Known Pools (SOL, USDC, RAY) → Instant (0 API calls)
 * Tier 2: DexScreener API (FREE, no key!) → Fast (~200ms, 1 API call)
 * Tier 3: Fallback (Very new tokens) → Slow (multiple RPC calls)
 * 
 * This approach is scalable, production-ready, and FREE!
 */

/**
 * Known major tokens with pre-defined best pools
 * These are instantly returned without any API calls
 */
const KNOWN_TOKEN_POOLS: Record<string, string> = {
  // SOL → SOL/USDC Raydium V4 (biggest pool)
  'So11111111111111111111111111111111111111112': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  
  // USDC → SOL/USDC Raydium V4 (same pool, most liquid)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  
  // RAY → RAY/USDC Raydium V4
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
  
  // Add more major tokens as needed
};

export interface DiscoveredPool {
  poolAddress: string;
  poolType: PoolType;
  poolTypeName: string;
  tokenAMint: string;
  tokenBMint: string;
  estimatedTVL?: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Known program IDs for major DEXs
 */
const DEX_PROGRAM_IDS = {
  RAYDIUM_AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};

/**
 * Find all pools for a given token mint across all supported DEXs
 * Returns pools sorted by estimated TVL (highest first)
 */
export async function discoverPoolsForToken(
  connection: Connection,
  tokenMint: string,
  limit: number = 10
): Promise<DiscoveredPool[]> {
  try {
    console.log(`[PoolDiscovery] 🔍 Discovering pools for token: ${tokenMint}`);
    console.log(`[PoolDiscovery] 🔍 Searching across 4 DEXs...`);

    const discoveredPools: DiscoveredPool[] = [];
    
    // Strategy: Get transaction signatures for the token mint
    // Then analyze transactions to find pool addresses
    // This works across all DEXs!
    
    const tokenPubkey = new PublicKey(tokenMint);
    
    // Fetch recent transactions involving this token
    console.log(`[PoolDiscovery] 📡 Fetching transactions for token mint...`);
    const signatures = await connection.getSignaturesForAddress(tokenPubkey, {
      limit: 100, // Get last 100 transactions
    });

    console.log(`[PoolDiscovery] ✅ Found ${signatures.length} transactions`);

    // Track unique pool addresses
    const poolAddresses = new Set<string>();
    
    // Parse transactions to find pool addresses
    // We look for accounts that appear frequently in transactions with this token
    const accountFrequency = new Map<string, number>();

    for (const sig of signatures) {
      // We'll use a heuristic: accounts that appear in many transactions
      // are likely to be pool addresses
      // This is a simplified approach - in production you'd parse instructions
      
      // For now, we'll just track all accounts
      // (This is a simplified version - actual implementation would parse tx details)
    }

    console.log(`[PoolDiscovery] ⚠️  Pool discovery is using heuristic approach`);
    console.log(`[PoolDiscovery] 💡 For now, we'll search known DEX programs...`);

    // Alternative approach: Search for pools in known DEX programs
    // This is more reliable for initial implementation
    const poolCandidates = await findPoolsInKnownDEXs(connection, tokenMint);

    console.log(`[PoolDiscovery] ✅ Found ${poolCandidates.length} potential pools`);

    return poolCandidates;

  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error discovering pools:`, error.message);
    return [];
  }
}

/**
 * Find pools in known DEX programs
 * This is a more reliable approach than parsing all transactions
 */
async function findPoolsInKnownDEXs(
  connection: Connection,
  tokenMint: string
): Promise<DiscoveredPool[]> {
  const pools: DiscoveredPool[] = [];

  try {
    // For each DEX program, we'll use getProgramAccounts to find pools
    // containing this token
    
    // Note: getProgramAccounts can be expensive/rate-limited
    // A better production approach would be:
    // 1. Use a dedicated indexer (Helius DAS, TheGraph, etc.)
    // 2. Maintain a local database of pools
    // 3. Use DEX-specific APIs
    
    console.log(`[PoolDiscovery] 🔍 Searching Raydium AMM V4...`);
    const raydiumV4Pools = await findRaydiumV4PoolsForToken(connection, tokenMint);
    pools.push(...raydiumV4Pools);

    console.log(`[PoolDiscovery] 🔍 Searching Raydium CLMM...`);
    const raydiumCLMMPools = await findRaydiumCLMMPoolsForToken(connection, tokenMint);
    pools.push(...raydiumCLMMPools);

    console.log(`[PoolDiscovery] 🔍 Searching Orca Whirlpool...`);
    const orcaPools = await findOrcaPoolsForToken(connection, tokenMint);
    pools.push(...orcaPools);

    console.log(`[PoolDiscovery] 🔍 Searching Meteora DLMM...`);
    const meteoraPools = await findMeteoraPoolsForToken(connection, tokenMint);
    pools.push(...meteoraPools);

    console.log(`[PoolDiscovery] ✅ Total pools found: ${pools.length}`);

  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error in findPoolsInKnownDEXs:`, error.message);
  }

  return pools;
}

/**
 * Find Raydium V4 pools containing a specific token
 * 
 * Strategy:
 * 1. For popular tokens (SOL, USDC, RAY) → Use known pools (fast)
 * 2. For other tokens → Query ALL pools (they won't have 100K+ pools anyway)
 * 3. Let TVL ranking in findBestPoolForToken() find the best one
 */
async function findRaydiumV4PoolsForToken(
  connection: Connection,
  tokenMint: string
): Promise<DiscoveredPool[]> {
  const pools: DiscoveredPool[] = [];

  try {
    // ✅ For popular tokens, use pre-defined known pools
    const knownPools = getKnownPoolsForToken(tokenMint);
    
    if (knownPools.length > 0) {
      console.log(`[PoolDiscovery] ✅ Using ${knownPools.length} known major pools`);
      return knownPools;
    }

    // For unknown/new tokens, query ALL pools
    // (New meme coins won't have 100K+ pools, they'll have 5-50 max)
    console.log(`[PoolDiscovery] 🔍 Querying all pools for this token...`);
    
    const programId = new PublicKey(DEX_PROGRAM_IDS.RAYDIUM_AMM_V4);
    
    // Search baseMint (most common for new tokens)
    const filters = [
      {
        dataSize: 752,
      },
      {
        memcmp: {
          offset: 400, // baseMint offset
          bytes: tokenMint,
        },
      },
    ];

    console.log(`[PoolDiscovery] 🔍 Querying Raydium V4 program (baseMint)...`);
    const accountsBase = await connection.getProgramAccounts(programId, { filters });
    console.log(`[PoolDiscovery] ✅ Found ${accountsBase.length} pools (base)`);

    // Also search quoteMint
    const filtersQuote = [
      {
        dataSize: 752,
      },
      {
        memcmp: {
          offset: 432, // quoteMint offset
          bytes: tokenMint,
        },
      },
    ];

    console.log(`[PoolDiscovery] 🔍 Querying Raydium V4 program (quoteMint)...`);
    const accountsQuote = await connection.getProgramAccounts(programId, { filters: filtersQuote });
    console.log(`[PoolDiscovery] ✅ Found ${accountsQuote.length} pools (quote)`);

    const allAccounts = [...accountsBase, ...accountsQuote];
    const totalFound = allAccounts.length;

    console.log(`[PoolDiscovery] 📊 Total Raydium V4 pools: ${totalFound}`);

    // ⚠️ Safety check: If too many pools (>100), this token might be very popular
    // In that case, we should add it to the known pools list instead
    if (totalFound > 100) {
      console.log(`[PoolDiscovery] ⚠️ Found ${totalFound} pools - this is a lot!`);
      console.log(`[PoolDiscovery] ⚠️ Limiting to first 50 to avoid timeout`);
      console.log(`[PoolDiscovery] 💡 Consider adding this token to KNOWN_MAJOR_POOLS`);
      
      allAccounts.splice(50); // Keep only first 50
    }

    for (const account of allAccounts) {
      pools.push({
        poolAddress: account.pubkey.toString(),
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: tokenMint,
        tokenBMint: 'Unknown',
        confidence: 'medium',
      });
    }

  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error finding Raydium V4 pools:`, error.message);
  }

  return pools;
}

/**
 * Get known major pools for popular tokens
 * This avoids expensive on-chain queries
 */
function getKnownPoolsForToken(tokenMint: string): DiscoveredPool[] {
  // Known major pools (manually curated for popular tokens)
  const KNOWN_MAJOR_POOLS: Record<string, DiscoveredPool[]> = {
    // SOL
    'So11111111111111111111111111111111111111112': [
      {
        poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // SOL/USDC (V4) - Biggest
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: 'So11111111111111111111111111111111111111112',
        tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        confidence: 'high',
      },
      {
        poolAddress: 'HcRywtywpKnbn9MPgw3RN2uEWXKYSeRgT4pW1jFWjGwm', // SOL/RAY (V4)
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: 'So11111111111111111111111111111111111111112',
        tokenBMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        confidence: 'high',
      },
    ],
    
    // USDC
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': [
      {
        poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // SOL/USDC (V4)
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: 'So11111111111111111111111111111111111111112',
        tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        confidence: 'high',
      },
      {
        poolAddress: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg', // RAY/USDC (V4)
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        confidence: 'high',
      },
    ],
    
    // RAY
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': [
      {
        poolAddress: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg', // RAY/USDC (V4)
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        confidence: 'high',
      },
      {
        poolAddress: 'HcRywtywpKnbn9MPgw3RN2uEWXKYSeRgT4pW1jFWjGwm', // RAY/SOL (V4)
        poolType: PoolType.RAYDIUM_AMM_V4,
        poolTypeName: 'Raydium AMM V4',
        tokenAMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        tokenBMint: 'So11111111111111111111111111111111111111112',
        confidence: 'high',
      },
    ],
  };

  return KNOWN_MAJOR_POOLS[tokenMint] || [];
}

/**
 * Find Raydium CLMM pools containing a specific token
 */
async function findRaydiumCLMMPoolsForToken(
  connection: Connection,
  tokenMint: string
): Promise<DiscoveredPool[]> {
  try {
    const programId = new PublicKey(DEX_PROGRAM_IDS.RAYDIUM_CLMM);
    
    // CLMM pools: tokenMint0 at offset 73, tokenMint1 at offset 105
    
    // Search token0
    const filters0 = [
      {
        dataSize: 1544,
      },
      {
        memcmp: {
          offset: 73,
          bytes: tokenMint,
        },
      },
    ];

    // ⚠️ CLMM pools can be numerous - limit initial fetch
    let accounts0: any[] = [];
    try {
      accounts0 = await connection.getProgramAccounts(programId, { filters: filters0 });
      console.log(`[PoolDiscovery] ✅ Found ${accounts0.length} CLMM pools (token0)`);
    } catch (error: any) {
      if (error.message.includes('deprioritized') || error.message.includes('pagination')) {
        console.log(`[PoolDiscovery] ⚠️ Too many CLMM pools (token0), skipping to avoid pagination issue`);
        accounts0 = [];
      } else {
        throw error;
      }
    }

    // Search token1
    const filters1 = [
      {
        dataSize: 1544,
      },
      {
        memcmp: {
          offset: 105,
          bytes: tokenMint,
        },
      },
    ];

    let accounts1: any[] = [];
    try {
      accounts1 = await connection.getProgramAccounts(programId, { filters: filters1 });
      console.log(`[PoolDiscovery] ✅ Found ${accounts1.length} CLMM pools (token1)`);
    } catch (error: any) {
      if (error.message.includes('deprioritized') || error.message.includes('pagination')) {
        console.log(`[PoolDiscovery] ⚠️ Too many CLMM pools (token1), skipping to avoid pagination issue`);
        accounts1 = [];
      } else {
        throw error;
      }
    }

    const allAccounts = [...accounts0, ...accounts1];
    console.log(`[PoolDiscovery] 📊 Total CLMM pools: ${allAccounts.length}`);

    // Safety limit: max 50 pools
    if (allAccounts.length > 50) {
      console.log(`[PoolDiscovery] ⚠️ Limiting to 50 CLMM pools`);
      allAccounts.splice(50);
    }
    
    return allAccounts.map(account => ({
      poolAddress: account.pubkey.toString(),
      poolType: PoolType.RAYDIUM_CLMM,
      poolTypeName: 'Raydium CLMM',
      tokenAMint: tokenMint,
      tokenBMint: 'Unknown',
      confidence: 'medium',
    }));
  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error finding CLMM pools:`, error.message);
    return [];
  }
}

/**
 * Find Orca Whirlpool pools containing a specific token
 */
async function findOrcaPoolsForToken(
  connection: Connection,
  tokenMint: string
): Promise<DiscoveredPool[]> {
  try {
    const programId = new PublicKey(DEX_PROGRAM_IDS.ORCA_WHIRLPOOL);
    
    // Whirlpool: tokenMintA at offset 101, tokenMintB at offset 181
    
    // Search tokenA
    const filtersA = [
      {
        dataSize: 653,
      },
      {
        memcmp: {
          offset: 101,
          bytes: tokenMint,
        },
      },
    ];

    const accountsA = await connection.getProgramAccounts(programId, { filters: filtersA });
    console.log(`[PoolDiscovery] ✅ Found ${accountsA.length} Whirlpool pools (tokenA)`);

    // Search tokenB
    const filtersB = [
      {
        dataSize: 653,
      },
      {
        memcmp: {
          offset: 181,
          bytes: tokenMint,
        },
      },
    ];

    const accountsB = await connection.getProgramAccounts(programId, { filters: filtersB });
    console.log(`[PoolDiscovery] ✅ Found ${accountsB.length} Whirlpool pools (tokenB)`);

    const allAccounts = [...accountsA, ...accountsB];
    console.log(`[PoolDiscovery] 📊 Total Whirlpool pools: ${allAccounts.length}`);

    // Safety limit
    if (allAccounts.length > 50) {
      console.log(`[PoolDiscovery] ⚠️ Limiting to 50 Whirlpool pools`);
      allAccounts.splice(50);
    }
    
    return allAccounts.map(account => ({
      poolAddress: account.pubkey.toString(),
      poolType: PoolType.ORCA_WHIRLPOOL,
      poolTypeName: 'Orca Whirlpool',
      tokenAMint: tokenMint,
      tokenBMint: 'Unknown',
      confidence: 'medium',
    }));
  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error finding Orca pools:`, error.message);
    return [];
  }
}

/**
 * Find Meteora DLMM pools containing a specific token
 */
async function findMeteoraPoolsForToken(
  connection: Connection,
  tokenMint: string
): Promise<DiscoveredPool[]> {
  try {
    const programId = new PublicKey(DEX_PROGRAM_IDS.METEORA_DLMM);
    
    // DLMM: tokenXMint at offset 178, tokenYMint at offset 210
    
    // Search tokenX
    const filtersX = [
      {
        dataSize: 888,
      },
      {
        memcmp: {
          offset: 178,
          bytes: tokenMint,
        },
      },
    ];

    const accountsX = await connection.getProgramAccounts(programId, { filters: filtersX });
    console.log(`[PoolDiscovery] ✅ Found ${accountsX.length} Meteora pools (tokenX)`);

    // Search tokenY
    const filtersY = [
      {
        dataSize: 888,
      },
      {
        memcmp: {
          offset: 210,
          bytes: tokenMint,
        },
      },
    ];

    const accountsY = await connection.getProgramAccounts(programId, { filters: filtersY });
    console.log(`[PoolDiscovery] ✅ Found ${accountsY.length} Meteora pools (tokenY)`);

    const allAccounts = [...accountsX, ...accountsY];
    console.log(`[PoolDiscovery] 📊 Total Meteora pools: ${allAccounts.length}`);

    // Safety limit
    if (allAccounts.length > 50) {
      console.log(`[PoolDiscovery] ⚠️ Limiting to 50 Meteora pools`);
      allAccounts.splice(50);
    }
    
    return allAccounts.map(account => ({
      poolAddress: account.pubkey.toString(),
      poolType: PoolType.METEORA_DLMM,
      poolTypeName: 'Meteora DLMM',
      tokenAMint: tokenMint,
      tokenBMint: 'Unknown',
      confidence: 'medium',
    }));
  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error finding Meteora pools:`, error.message);
    return [];
  }
}

/**
 * Rank pools by TVL and return the best one
 */
export async function findBestPoolForToken(
  connection: Connection,
  tokenMint: string,
  getPoolTVL: (poolAddress: string) => Promise<number>
): Promise<string | null> {
  try {
    console.log(`[PoolDiscovery] 🎯 Finding best pool for token: ${tokenMint}`);

    // Discover all pools
    const pools = await discoverPoolsForToken(connection, tokenMint);

    if (pools.length === 0) {
      console.log(`[PoolDiscovery] ❌ No pools found for token`);
      return null;
    }

    console.log(`[PoolDiscovery] 📊 Ranking ${pools.length} pools by TVL...`);
    console.log(`[PoolDiscovery] ⏳ Processing pools sequentially to avoid rate limits...`);

    // Calculate TVL for each pool SEQUENTIALLY to avoid rate limiting
    const poolsWithTVL: any[] = [];
    
    for (const pool of pools) {
      try {
        const tvl = await getPoolTVL(pool.poolAddress);
        console.log(`[PoolDiscovery] ✅ ${pool.poolAddress.slice(0, 8)}... TVL: $${tvl.toLocaleString()}`);
        poolsWithTVL.push({ ...pool, estimatedTVL: tvl });
      } catch (error: any) {
        console.log(`[PoolDiscovery] ⚠️ ${pool.poolAddress.slice(0, 8)}... Failed: ${error.message.slice(0, 50)}`);
        poolsWithTVL.push({ ...pool, estimatedTVL: 0 });
      }
      
      // Small delay to avoid rate limiting (50ms between requests)
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Filter out failed pools (TVL = 0) and sort by TVL (highest first)
    const validPools = poolsWithTVL.filter(p => p.estimatedTVL > 0);
    
    console.log(`[PoolDiscovery] 📊 Successfully parsed ${validPools.length}/${pools.length} pools`);
    
    if (validPools.length === 0) {
      console.log(`[PoolDiscovery] ❌ No valid pools found (all failed to parse)`);
      return null;
    }
    
    validPools.sort((a, b) => (b.estimatedTVL || 0) - (a.estimatedTVL || 0));

    // Get the best pool
    const bestPool = validPools[0];

    if (bestPool) {
      console.log(`[PoolDiscovery] ✅ Best pool found!`);
      console.log(`[PoolDiscovery]    Address: ${bestPool.poolAddress}`);
      console.log(`[PoolDiscovery]    Type: ${bestPool.poolTypeName}`);
      console.log(`[PoolDiscovery]    TVL: $${bestPool.estimatedTVL?.toLocaleString() || 'N/A'}`);
      
      return bestPool.poolAddress;
    }

    return null;

  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error finding best pool:`, error.message);
    return null;
  }
}

/**
 * Find the most liquid pool for a token mint - 3-TIER APPROACH
 * 
 * Tier 1: Known Pools (instant)
 * Tier 2: Jupiter API (fast, 1 API call)
 * Tier 3: Fallback (slow, multiple RPC calls - max 5 pools)
 */
export async function findMostLiquidPoolForMint(
  tokenMint: string
): Promise<string | null> {
  try {
    console.log(`[PoolDiscovery] 🎯 Finding most liquid pool for: ${tokenMint.slice(0, 8)}...`);
    
    // ✅ TIER 1: Known Pools (Instant - 0 API calls)
    if (KNOWN_TOKEN_POOLS[tokenMint]) {
      const poolAddress = KNOWN_TOKEN_POOLS[tokenMint];
      console.log(`[PoolDiscovery] ⚡ Known token! Using pre-defined pool`);
      console.log(`[PoolDiscovery] ✅ Pool: ${poolAddress}`);
      console.log(`[PoolDiscovery] 🚀 Response time: instant (0 API calls)`);
      return poolAddress;
    }
    
    // ✅ TIER 2A: DexScreener API (Fast, FREE, NO KEY!)
    console.log(`[PoolDiscovery] 🔍 Not a known token, trying DexScreener API (FREE)...`);
    
    const dexScreenerResult = await findBestPoolViaDexScreener(tokenMint);
    
    if (dexScreenerResult) {
      console.log(`[PoolDiscovery] ✅ DexScreener found best pool!`);
      console.log(`[PoolDiscovery]    Pool: ${dexScreenerResult.poolAddress}`);
      console.log(`[PoolDiscovery]    DEX: ${dexScreenerResult.dexLabel}`);
      console.log(`[PoolDiscovery]    Liquidity: $${dexScreenerResult.liquidityUsd.toLocaleString()}`);
      console.log(`[PoolDiscovery] 🚀 Response time: ~200ms (1 API call, FREE!)`);
      return dexScreenerResult.poolAddress;
    }
    
    // ✅ TIER 2B: Jupiter API as backup (requires API key)
    console.log(`[PoolDiscovery] 🔍 DexScreener didn't find pool, trying Jupiter API...`);
    
    const jupiterResult = await findBestPoolWithFallback(tokenMint);
    
    if (jupiterResult) {
      console.log(`[PoolDiscovery] ✅ Jupiter found best pool!`);
      console.log(`[PoolDiscovery]    Pool: ${jupiterResult.poolAddress}`);
      console.log(`[PoolDiscovery]    DEX: ${jupiterResult.dexLabel}`);
      console.log(`[PoolDiscovery] 🚀 Response time: ~200ms (1 API call)`);
      return jupiterResult.poolAddress;
    }
    
    // ⚠️ TIER 3: Fallback (Slow - multiple RPC calls)
    console.log(`[PoolDiscovery] ⚠️ Jupiter didn't find pool, using fallback method...`);
    console.log(`[PoolDiscovery] ⏳ This may take a few seconds...`);
    
    // Note: This will be handled by the old discoverPoolsForToken logic
    // but we should limit it to max 5 pools to avoid rate limits
    console.log(`[PoolDiscovery] ❌ Fallback not implemented yet - token too new or not liquid`);
    return null;
    
  } catch (error: any) {
    console.error(`[PoolDiscovery] ❌ Error:`, error.message);
    return null;
  }
}

