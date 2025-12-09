// apps/solana-liquidity-agent/src/lib/dexscreener-client.ts

/**
 * DexScreener API Client
 * 
 * DexScreener provides FREE API access (no key required!) to DEX data.
 * We use it to find the most liquid pool for any token.
 * 
 * Benefits:
 * - NO API key required (completely free!)
 * - Real-time liquidity data
 * - Supports all major Solana DEXs
 * - Rate limit: ~300 req/min (sufficient)
 * 
 * Docs: https://docs.dexscreener.com/api/reference
 */

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
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
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

/**
 * Find the most liquid pool for a token using DexScreener API
 * NO API KEY REQUIRED!
 * 
 * @param tokenMint - The token mint address
 * @returns Pool address of the most liquid pool, or null if not found
 */
export async function findBestPoolViaDexScreener(
  tokenMint: string
): Promise<{ poolAddress: string; dexLabel: string; liquidityUsd: number } | null> {
  try {
    console.log(`[DexScreener] 🔍 Finding best pool for token: ${tokenMint.slice(0, 8)}...`);
    
    // DexScreener API endpoint (FREE, NO KEY!)
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`;
    
    console.log(`[DexScreener] 📡 Calling DexScreener API...`);
    console.log(`[DexScreener] 🔗 URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Solana-Liquidity-Agent/1.0',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[DexScreener] ❌ API error: ${response.status} ${response.statusText}`);
      console.log(`[DexScreener] ❌ Response: ${errorText.slice(0, 200)}`);
      return null;
    }
    
    const data: DexScreenerResponse = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`[DexScreener] ⚠️ No pairs found for this token`);
      return null;
    }
    
    // Filter for Solana pairs that actually contain our token AND have liquidity data
    const solanaPairs = data.pairs.filter(pair => {
      const isSolana = pair.chainId === 'solana';
      const hasToken = 
        pair.baseToken.address.toLowerCase() === tokenMint.toLowerCase() ||
        pair.quoteToken.address.toLowerCase() === tokenMint.toLowerCase();
      const hasLiquidity = pair.liquidity && typeof pair.liquidity.usd === 'number';
      return isSolana && hasToken && hasLiquidity;
    });
    
    if (solanaPairs.length === 0) {
      console.log(`[DexScreener] ⚠️ No Solana pairs found for this token`);
      return null;
    }
    
    console.log(`[DexScreener] ✅ Found ${solanaPairs.length} Solana pairs for this token`);
    
    // DEBUG: Log all found pairs with FULL addresses
    console.log(`[DexScreener] 🔍 DEBUG: All pairs for this token:`);
    solanaPairs.forEach((pair, index) => {
      console.log(`[DexScreener]    Pair ${index + 1}:`);
      console.log(`[DexScreener]      Pool: ${pair.pairAddress}`);
      console.log(`[DexScreener]      Base: ${pair.baseToken.symbol}`);
      console.log(`[DexScreener]        Address: ${pair.baseToken.address}`);
      console.log(`[DexScreener]      Quote: ${pair.quoteToken.symbol}`);
      console.log(`[DexScreener]        Address: ${pair.quoteToken.address}`);
      console.log(`[DexScreener]      Liquidity: $${pair.liquidity?.usd?.toLocaleString() || 'N/A'}`);
      console.log(`[DexScreener]      Requested Token: ${tokenMint}`);
      console.log(`[DexScreener]      Match: Base=${pair.baseToken.address === tokenMint}, Quote=${pair.quoteToken.address === tokenMint}`);
    });
    
    // Sort by liquidity (highest first)
    const sortedPairs = solanaPairs.sort((a, b) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    );
    
    // Get the most liquid pair
    const bestPair = sortedPairs[0];
    
    if (!bestPair.pairAddress) {
      console.log(`[DexScreener] ⚠️ No pool address found`);
      return null;
    }
    
    console.log(`[DexScreener] ✅ Best pool found!`);
    console.log(`[DexScreener]    Pool: ${bestPair.pairAddress}`);
    console.log(`[DexScreener]    DEX: ${bestPair.dexId}`);
    console.log(`[DexScreener]    Liquidity: $${bestPair.liquidity.usd.toLocaleString()}`);
    console.log(`[DexScreener]    24h Volume: $${bestPair.volume.h24.toLocaleString()}`);
    console.log(`[DexScreener]    Pair: ${bestPair.baseToken.symbol}/${bestPair.quoteToken.symbol}`);
    
    return {
      poolAddress: bestPair.pairAddress,
      dexLabel: bestPair.dexId,
      liquidityUsd: bestPair.liquidity.usd,
      liquidityBase: bestPair.liquidity.base || 0, // Reserve amount for base token
      liquidityQuote: bestPair.liquidity.quote || 0, // Reserve amount for quote token
      baseToken: bestPair.baseToken,
      quoteToken: bestPair.quoteToken,
    };
    
  } catch (error: any) {
    console.error(`[DexScreener] ❌ Error:`, error.message);
    console.error(`[DexScreener] ❌ Error Type:`, error.name);
    
    // Check if it's a network issue
    if (error.message.includes('fetch') || error.message.includes('connect')) {
      console.error(`[DexScreener] 🌐 Network issue detected`);
    }
    
    return null;
  }
}

