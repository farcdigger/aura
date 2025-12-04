// apps/solana-liquidity-agent/src/lib/price-fetcher.ts

/**
 * Price Fetcher - CoinGecko API Integration
 * Fetches real-time USD prices for SOL and major tokens
 * 
 * Features:
 * - In-memory caching (5 min TTL)
 * - Fallback to 0 on errors
 * - Support for SOL, USDC, RAY, and other major tokens
 */

// =============================================================================
// TYPES
// =============================================================================

interface TokenPrice {
  symbol: string;
  usd: number;
  lastUpdated: number;
}

interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Token symbol to CoinGecko ID mapping
 * Add more tokens as needed
 */
const TOKEN_ID_MAP: Record<string, string> = {
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  RAY: 'raydium',
  ORCA: 'orca',
  JUP: 'jupiter-exchange-solana',
  BONK: 'bonk',
  WIF: 'dogwifcoin',
  PYTH: 'pyth-network',
  JTO: 'jito-governance-token',
};

// In-memory cache
const priceCache = new Map<string, TokenPrice>();

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Fetch price for a single token by symbol
 * @param symbol Token symbol (e.g., 'SOL', 'USDC')
 * @returns Price in USD, or 0 if not found/error
 */
export async function getTokenPrice(symbol: string): Promise<number> {
  // Normalize symbol
  const normalizedSymbol = symbol.toUpperCase();

  // Check cache first
  const cached = priceCache.get(normalizedSymbol);
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
    console.log(`[PriceFetcher] Using cached price for ${normalizedSymbol}: $${cached.usd}`);
    return cached.usd;
  }

  // Special case: USDC/USDT are always $1
  if (normalizedSymbol === 'USDC' || normalizedSymbol === 'USDT') {
    const price = 1.0;
    priceCache.set(normalizedSymbol, {
      symbol: normalizedSymbol,
      usd: price,
      lastUpdated: Date.now(),
    });
    return price;
  }

  // Get CoinGecko ID
  const coinGeckoId = TOKEN_ID_MAP[normalizedSymbol];
  if (!coinGeckoId) {
    console.warn(`[PriceFetcher] No CoinGecko ID mapping for ${normalizedSymbol}, returning 0`);
    return 0;
  }

  // Fetch from CoinGecko
  try {
    console.log(`[PriceFetcher] Fetching price for ${normalizedSymbol} from CoinGecko...`);
    
    const url = `${COINGECKO_API_BASE}/simple/price?ids=${coinGeckoId}&vs_currencies=usd`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data: CoinGeckoResponse = await response.json();
    const price = data[coinGeckoId]?.usd;

    if (typeof price !== 'number') {
      throw new Error(`Invalid price data for ${normalizedSymbol}`);
    }

    // Cache the result
    priceCache.set(normalizedSymbol, {
      symbol: normalizedSymbol,
      usd: price,
      lastUpdated: Date.now(),
    });

    console.log(`[PriceFetcher] ✅ ${normalizedSymbol} price: $${price.toFixed(2)}`);
    return price;

  } catch (error: any) {
    console.error(`[PriceFetcher] ❌ Failed to fetch price for ${normalizedSymbol}:`, error.message);
    return 0; // Fallback to 0 on error
  }
}

/**
 * Fetch prices for multiple tokens in a single request
 * More efficient than multiple individual requests
 * 
 * @param symbols Array of token symbols
 * @returns Map of symbol to price
 */
export async function getTokenPrices(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  // Normalize symbols
  const normalizedSymbols = symbols.map(s => s.toUpperCase());
  
  // Separate stablecoins (always $1) from tokens that need API calls
  const stablecoins = normalizedSymbols.filter(s => s === 'USDC' || s === 'USDT');
  const tokensToFetch = normalizedSymbols.filter(s => s !== 'USDC' && s !== 'USDT');

  // Set stablecoin prices
  stablecoins.forEach(symbol => {
    prices.set(symbol, 1.0);
    priceCache.set(symbol, {
      symbol,
      usd: 1.0,
      lastUpdated: Date.now(),
    });
  });

  // Check cache for other tokens
  const uncachedTokens: string[] = [];
  for (const symbol of tokensToFetch) {
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
      prices.set(symbol, cached.usd);
    } else {
      uncachedTokens.push(symbol);
    }
  }

  // Fetch uncached tokens
  if (uncachedTokens.length > 0) {
    const coinGeckoIds = uncachedTokens
      .map(symbol => TOKEN_ID_MAP[symbol])
      .filter(id => id !== undefined);

    if (coinGeckoIds.length > 0) {
      try {
        const idsParam = coinGeckoIds.join(',');
        const url = `${COINGECKO_API_BASE}/simple/price?ids=${idsParam}&vs_currencies=usd`;
        
        console.log(`[PriceFetcher] Fetching prices for ${uncachedTokens.length} tokens...`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data: CoinGeckoResponse = await response.json();

        // Map results back to symbols
        uncachedTokens.forEach(symbol => {
          const coinGeckoId = TOKEN_ID_MAP[symbol];
          if (coinGeckoId && data[coinGeckoId]?.usd) {
            const price = data[coinGeckoId].usd;
            prices.set(symbol, price);
            priceCache.set(symbol, {
              symbol,
              usd: price,
              lastUpdated: Date.now(),
            });
            console.log(`[PriceFetcher] ✅ ${symbol}: $${price.toFixed(2)}`);
          } else {
            prices.set(symbol, 0);
            console.warn(`[PriceFetcher] ⚠️ No price data for ${symbol}`);
          }
        });

      } catch (error: any) {
        console.error(`[PriceFetcher] ❌ Batch fetch failed:`, error.message);
        // Set remaining tokens to 0
        uncachedTokens.forEach(symbol => {
          if (!prices.has(symbol)) {
            prices.set(symbol, 0);
          }
        });
      }
    }
  }

  return prices;
}

/**
 * Calculate pool TVL in USD
 * @param tokenASymbol Token A symbol
 * @param tokenAAmount Token A amount (human-readable)
 * @param tokenBSymbol Token B symbol
 * @param tokenBAmount Token B amount (human-readable)
 * @returns TVL in USD
 */
export async function calculatePoolTVL(
  tokenASymbol: string,
  tokenAAmount: number,
  tokenBSymbol: string,
  tokenBAmount: number
): Promise<number> {
  console.log(`[PriceFetcher] Calculating TVL for ${tokenASymbol}/${tokenBSymbol} pool...`);

  // Fetch prices for both tokens
  const prices = await getTokenPrices([tokenASymbol, tokenBSymbol]);

  const tokenAPrice = prices.get(tokenASymbol.toUpperCase()) || 0;
  const tokenBPrice = prices.get(tokenBSymbol.toUpperCase()) || 0;

  const tokenAValue = tokenAAmount * tokenAPrice;
  const tokenBValue = tokenBAmount * tokenBPrice;
  const tvl = tokenAValue + tokenBValue;

  console.log(`[PriceFetcher] TVL Breakdown:`);
  console.log(`  ${tokenASymbol}: ${tokenAAmount.toFixed(2)} × $${tokenAPrice.toFixed(2)} = $${tokenAValue.toLocaleString()}`);
  console.log(`  ${tokenBSymbol}: ${tokenBAmount.toFixed(2)} × $${tokenBPrice.toFixed(2)} = $${tokenBValue.toLocaleString()}`);
  console.log(`  Total TVL: $${tvl.toLocaleString()}`);

  return tvl;
}

/**
 * Clear price cache (useful for testing)
 */
export function clearPriceCache(): void {
  priceCache.clear();
  console.log('[PriceFetcher] Cache cleared');
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): { size: number; entries: Array<{ symbol: string; age: number }> } {
  const now = Date.now();
  const entries = Array.from(priceCache.entries()).map(([symbol, data]) => ({
    symbol,
    age: Math.floor((now - data.lastUpdated) / 1000), // seconds
  }));

  return {
    size: priceCache.size,
    entries,
  };
}

