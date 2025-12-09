/**
 * Birdeye Data Services API Client
 * 
 * Complete replacement for Helius API - all data from Birdeye
 * - Pool reserves & liquidity
 * - Token metadata
 * - Swap transaction history
 * Documentation: https://docs.birdeye.so/
 */

import type { ParsedSwap, TokenMetadata, AdjustedPoolReserves } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY!;

// Rate limits
// Standard (Free) plan: 1 RPS (very limited)
// Lite plan: 15 RPS ← CURRENT PLAN
// Premium Plus: 50 RPS
// Business: 100 RPS
const RPS_LIMIT = parseInt(process.env.BIRDEYE_RPS_LIMIT || '15', 10); // Default: Lite plan (15 RPS)
const REQUEST_DELAY_MS = 1000 / RPS_LIMIT; // Delay between requests

// Pagination limits
const MAX_PER_PAGE = 50; // Birdeye API max per request
// Lite plan: 10,000 swaps supported (our production setting)
const MAX_TOTAL_SWAPS = parseInt(process.env.BIRDEYE_MAX_SWAPS || '10000', 10); // Production: 10K swaps

// =============================================================================
// BIRDEYE API TYPES
// =============================================================================

/**
 * Birdeye API Swap Transaction Response
 * Based on official Birdeye documentation
 */
interface BirdeyeSwapTransaction {
  /** Transaction hash/signature (field name: txHash) */
  txHash: string;
  /** Unix timestamp in seconds (field name: blockUnixTime) */
  blockUnixTime: number;
  /** Transaction type: "swap", "add", "remove" */
  txType: string;
  /** Wallet address that initiated the transaction (field name: owner) */
  owner: string;
  /** Transaction side: "buy", "sell", "unknown" */
  side?: string;
  /** DEX/Protocol source (e.g., "raydium", "pump_amm", "jupiter") */
  source: string;
  /** Pool/Pair address (field name: address or poolId) */
  address?: string;
  poolId?: string;
  pairAddress?: string;
  /** From token transfer details */
  from?: {
    symbol: string;
    address: string;
    amount: string;
    uiAmount: number;
    decimals: number;
    price?: number;
  };
  /** To token transfer details */
  to?: {
    symbol: string;
    address: string;
    amount: string;
    uiAmount: number;
    decimals: number;
    price?: number;
  };
  /** Base token (for pair-based queries) */
  base?: {
    symbol: string;
    address: string;
    amount: string;
  };
  /** Quote token (for pair-based queries) */
  quote?: {
    symbol: string;
    address: string;
    amount: string;
  };
}

/**
 * Birdeye API Response Wrapper
 */
interface BirdeyeResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// =============================================================================
// BIRDEYE CLIENT CLASS
// =============================================================================

export class BirdeyeClient {
  private lastRequestTime: number = 0;

  constructor() {
    if (!BIRDEYE_API_KEY) {
      throw new Error('BIRDEYE_API_KEY environment variable is not set');
    }
  }

  /**
   * Rate limiting helper
   * Ensures we don't exceed 15 RPS (Lite plan limit)
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < REQUEST_DELAY_MS) {
      const waitTime = REQUEST_DELAY_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch swap transactions for a trading pair
   * 
   * IMPORTANT: Birdeye API uses "pair address" which may differ from pool address
   * - For Raydium/Orca/Meteora: Usually the pool address works
   * - For Pump.fun: May need bonding curve address or token mint
   * 
   * @param pairAddress Trading pair address (pool address from DexScreener/Jupiter)
   * @param limit Maximum number of swaps to fetch (default: 2000, max: 10000 for Lite, 1000 for Standard)
   * @param tokenMint Optional: Token mint for filtering and direction detection (especially for Pump.fun)
   * @returns Array of parsed swap transactions
   */
  async getSwapTransactions(
    pairAddress: string,
    limit: number = 10000, // Production: default 10,000 swaps
    tokenMint?: string
  ): Promise<ParsedSwap[]> {
    try {
      console.log(`[BirdeyeClient] 🔍 Fetching swap transactions...`);
      console.log(`[BirdeyeClient]    Pair Address: ${pairAddress}`);
      console.log(`[BirdeyeClient]    Token Mint: ${tokenMint || 'Not provided'}`);
      console.log(`[BirdeyeClient] 🎯 Target: ${limit} swaps`);
      console.log(`[BirdeyeClient] 📊 Plan: LITE (${RPS_LIMIT} RPS, max ${MAX_TOTAL_SWAPS} swaps) ⚡`);

      const allSwaps: ParsedSwap[] = [];
      let offset = 0;
      const targetLimit = Math.min(limit, MAX_TOTAL_SWAPS);

      // Strategy: Try multiple endpoints in order
      // ✅ PRIORITY: Use token mint first (more reliable, especially for Pump.fun)
      // 1. Token v2 endpoint: /defi/txs/token (if tokenMint provided)
      // 2. Pair v2 endpoint: /defi/txs/pair (fallback if no tokenMint)
      // 3. History endpoint: /defi/v2/historical/txs (deep history)
      let endpointStrategy: 'pair_v2' | 'token_v2' | 'history' = tokenMint ? 'token_v2' : 'pair_v2';
      let lastError: any = null;

      while (allSwaps.length < targetLimit) {
        await this.rateLimit();

        const remaining = targetLimit - allSwaps.length;
        const currentLimit = Math.min(remaining, MAX_PER_PAGE);

        // Choose endpoint based on strategy (Based on official Birdeye documentation)
        let url: string;
        if (endpointStrategy === 'pair_v2') {
          // Strategy 1: Pair endpoint - specific pool transactions
          url = `${BIRDEYE_API_BASE}/defi/txs/pair?address=${pairAddress}&tx_type=swap&limit=${currentLimit}&offset=${offset}&sort_type=desc&ui_amount_mode=raw`;
          console.log(`[BirdeyeClient] 📡 Strategy: PAIR endpoint (/defi/txs/pair): ${allSwaps.length}/${targetLimit} swaps (offset: ${offset})...`);
        } else if (endpointStrategy === 'token_v2' && tokenMint) {
          // Strategy 2: Token endpoint - all pools for this token
          url = `${BIRDEYE_API_BASE}/defi/txs/token?address=${tokenMint}&tx_type=swap&limit=${currentLimit}&offset=${offset}&sort_type=desc&ui_amount_mode=raw`;
          console.log(`[BirdeyeClient] 📡 Strategy: TOKEN endpoint (/defi/txs/token): ${allSwaps.length}/${targetLimit} swaps (offset: ${offset})...`);
        } else if (endpointStrategy === 'history' && tokenMint) {
          // Strategy 3: Deep historical data with time-based seeking
          url = `${BIRDEYE_API_BASE}/defi/txs/token/seek_by_time?address=${tokenMint}&tx_type=swap&limit=${currentLimit}&sort_type=desc&ui_amount_mode=raw`;
          console.log(`[BirdeyeClient] 📡 Strategy: SEEK_BY_TIME endpoint (deep history): ${allSwaps.length}/${targetLimit} swaps...`);
        } else {
          // Fallback: use token endpoint if no tokenMint
          console.error(`[BirdeyeClient] ❌ No valid endpoint strategy and no token mint provided`);
          break;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-API-KEY': BIRDEYE_API_KEY,
            'x-chain': 'solana',
            'accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[BirdeyeClient] ❌ API Error (${response.status}):`, errorText.substring(0, 200));
          
            if (response.status === 429) {
            console.warn(`[BirdeyeClient] ⚠️ Rate limit hit (Lite plan: ${RPS_LIMIT} RPS), waiting 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue; // Retry
          }
          
          // If pair endpoint fails and we have tokenMint, try token endpoint
          if (endpointStrategy === 'pair_v2' && tokenMint && (response.status === 404 || response.status === 400)) {
            console.warn(`[BirdeyeClient] ⚠️ PAIR v2 endpoint failed (${response.status}), trying TOKEN v2 endpoint...`);
            endpointStrategy = 'token_v2';
            lastError = new Error(`Pair endpoint failed: ${response.status}`);
            offset = 0; // Reset offset for new endpoint
            continue; // Retry with token endpoint
          }
          
          // If token endpoint also fails, try history endpoint
          if (endpointStrategy === 'token_v2' && tokenMint && (response.status === 404 || response.status === 400)) {
            console.warn(`[BirdeyeClient] ⚠️ TOKEN v2 endpoint failed (${response.status}), trying HISTORY endpoint...`);
            endpointStrategy = 'history';
            lastError = new Error(`Token endpoint failed: ${response.status}`);
            offset = 0; // Reset offset for new endpoint
            continue; // Retry with history endpoint
          }
          
          // Standard plan may not have access to /defi/txs/pair endpoint
          if (response.status === 403 || response.status === 401) {
            throw new Error(`Birdeye API access denied. Standard plan may not support swap endpoints. Please upgrade to Lite plan.`);
          }
          
          // If we already tried all endpoints or don't have tokenMint, throw error
          if (endpointStrategy === 'history' || !tokenMint) {
            throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
          }
          
          // Try next endpoint as fallback
          if (endpointStrategy === 'pair_v2') {
            console.warn(`[BirdeyeClient] ⚠️ PAIR v2 failed, trying TOKEN v2...`);
            endpointStrategy = 'token_v2';
          } else if (endpointStrategy === 'token_v2') {
            console.warn(`[BirdeyeClient] ⚠️ TOKEN v2 failed, trying HISTORY...`);
            endpointStrategy = 'history';
          }
          offset = 0;
          continue;
        }

        const data = await response.json();
        
        // Debug: Log response structure (only first request to avoid spam)
        if (offset === 0) {
          console.log(`[BirdeyeClient] 🔍 API Response structure (${endpointStrategy} endpoint):`, {
            hasSuccess: 'success' in data,
            hasData: 'data' in data,
            hasItems: 'items' in data,
            dataType: Array.isArray(data) ? 'array' : typeof data,
            dataKeys: Array.isArray(data) ? 'array' : Object.keys(data || {}),
            sampleData: Array.isArray(data) ? data[0] : (data?.data?.[0] || data?.items?.[0] || 'N/A'),
          });
          
          // ENHANCED DEBUG: Show actual response structure for debugging
          console.log(`[BirdeyeClient] 🔍 Full response sample (first 1000 chars):`, JSON.stringify(data).substring(0, 1000));
          
          // Check what's inside data.data
          if (data?.data) {
            console.log(`[BirdeyeClient] 🔍 data.data structure:`, {
              isArray: Array.isArray(data.data),
              type: typeof data.data,
              keys: typeof data.data === 'object' && !Array.isArray(data.data) ? Object.keys(data.data) : 'N/A',
              length: Array.isArray(data.data) ? data.data.length : 'N/A',
            });
          }
        }

        // Handle official Birdeye API response format
        let swaps: BirdeyeSwapTransaction[] = [];
        let hasNext = false;
        
        // Check for error response first
        if (data?.success === false) {
          console.error(`[BirdeyeClient] ❌ API returned error: ${data.message || 'Unknown error'}`);
          console.error(`[BirdeyeClient] 🔍 Full response:`, JSON.stringify(data));
          break;
        }
        
        // Official format (based on documentation): { success: true, data: { items: [...], hasNext: true } }
        if (data?.success && data?.data?.items && Array.isArray(data.data.items)) {
          swaps = data.data.items;
          hasNext = data.data.hasNext || false;
          console.log(`[BirdeyeClient] ✅ Parsed official format: data.data.items (${swaps.length} items, hasNext: ${hasNext})`);
        } 
        // Fallback: data.items directly
        else if (data?.data?.items && Array.isArray(data.data.items)) {
          swaps = data.data.items;
          hasNext = data.data.hasNext || false;
          console.log(`[BirdeyeClient] ✅ Parsed format: data.items (${swaps.length} items, hasNext: ${hasNext})`);
        }
        // Fallback: data is array directly
        else if (data?.data && Array.isArray(data.data)) {
          swaps = data.data;
          console.log(`[BirdeyeClient] ✅ Parsed format: data[] (${swaps.length} items)`);
        }
        // Fallback: top-level items
        else if (data?.items && Array.isArray(data.items)) {
          swaps = data.items;
          hasNext = data.hasNext || false;
          console.log(`[BirdeyeClient] ✅ Parsed format: items[] (${swaps.length} items, hasNext: ${hasNext})`);
        }
        // Direct array
        else if (Array.isArray(data)) {
          swaps = data;
          console.log(`[BirdeyeClient] ✅ Parsed format: direct array (${swaps.length} items)`);
        }
        // Unknown format
        else {
          console.error(`[BirdeyeClient] ❌ Unexpected response format - no transactions available`);
          console.error(`[BirdeyeClient] 🔍 Response sample:`, JSON.stringify(data).substring(0, 500));
          break;
        }

        if (swaps.length === 0) {
          console.log(`[BirdeyeClient] ℹ️ No more transactions available (empty array)`);
          break;
        }
        
        // Parse Birdeye swaps to our format
        // ✅ IMPORTANT: When using TOKEN endpoint, we get swaps from ALL pools for this token
        // Strategy: Filter by target pool ID if it matches, otherwise use all swaps
        // This handles cases where DexScreener pool ID differs from Birdeye pool ID format
        let filteredCount = 0;
        let poolIdMatches = 0;
        
        // First pass: Check if any swaps match our target pool ID
        if (endpointStrategy === 'token_v2' || endpointStrategy === 'history') {
          for (const tx of swaps) {
            const txPoolId = tx.address || tx.poolId || tx.pairAddress;
            if (txPoolId && txPoolId.toLowerCase() === pairAddress.toLowerCase()) {
              poolIdMatches++;
            }
          }
          console.log(`[BirdeyeClient] 🔍 Found ${poolIdMatches} swaps matching target pool ID: ${pairAddress}`);
        }
        
        const parsedSwaps = swaps
          .filter(tx => {
            if (endpointStrategy === 'pair_v2') {
              // Pair endpoint: Only use swaps from this specific pool
              const txPoolId = tx.address || tx.poolId || tx.pairAddress;
              if (txPoolId && txPoolId.toLowerCase() !== pairAddress.toLowerCase()) {
                filteredCount++;
                return false;
              }
            } else if (endpointStrategy === 'token_v2' || endpointStrategy === 'history') {
              // Token endpoint: Prefer swaps from target pool, but include all if pool ID doesn't match
              // This handles cases where DexScreener pool ID format differs from Birdeye
              if (poolIdMatches > 0) {
                // If we found matching swaps, filter to only use those
                const txPoolId = tx.address || tx.poolId || tx.pairAddress;
                if (txPoolId && txPoolId.toLowerCase() !== pairAddress.toLowerCase()) {
                  filteredCount++;
                  return false;
                }
              }
              // If no matches, use all swaps (comprehensive token analysis)
            }
            return true;
          })
          .map(tx => this.parseBirdeyeSwap(tx, tokenMint))
          .filter((swap): swap is ParsedSwap => swap !== null);
        
        // Log filtering results
        if (endpointStrategy === 'pair_v2' && filteredCount > 0) {
          console.log(`[BirdeyeClient] 🔍 Filtered out ${filteredCount} swaps from other pools (PAIR endpoint)`);
        } else if ((endpointStrategy === 'token_v2' || endpointStrategy === 'history') && poolIdMatches > 0) {
          console.log(`[BirdeyeClient] ✅ Using ${poolIdMatches} swaps from target pool (pool ID matched)`);
          if (filteredCount > 0) {
            console.log(`[BirdeyeClient] 🔍 Filtered out ${filteredCount} swaps from other pools`);
          }
        } else if (endpointStrategy === 'token_v2' || endpointStrategy === 'history') {
          console.log(`[BirdeyeClient] ⚠️ Pool ID mismatch - using ALL swaps (comprehensive token analysis)`);
          console.log(`[BirdeyeClient] ⚠️ Target pool: ${pairAddress}`);
          console.log(`[BirdeyeClient] ⚠️ This may indicate DexScreener pool ID format differs from Birdeye`);
        }

        allSwaps.push(...parsedSwaps);
        console.log(`[BirdeyeClient] ✅ Fetched ${parsedSwaps.length} swaps (Total: ${allSwaps.length}/${targetLimit})`);
        
        // Detailed batch statistics
        if (parsedSwaps.length > 0) {
          const batchWithUsd = parsedSwaps.filter(s => s.amountInUsd !== undefined || s.amountOutUsd !== undefined);
          const batchUsdVolume = parsedSwaps.reduce((sum, s) => sum + (s.amountInUsd || s.amountOutUsd || 0), 0);
          console.log(`[BirdeyeClient]    - Swaps with USD data: ${batchWithUsd.length}/${parsedSwaps.length}`);
          console.log(`[BirdeyeClient]    - Batch USD volume: $${batchUsdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        }

        // Check if we should continue pagination
        // Priority 1: Check hasNext flag from API
        if (hasNext === false) {
          console.log(`[BirdeyeClient] ℹ️ API reports no more data (hasNext: false)`);
          break;
        }
        
        // Priority 2: If we got less than requested, we've reached the end
        if (swaps.length < currentLimit) {
          console.log(`[BirdeyeClient] ℹ️ Reached end of available transactions (got ${swaps.length} < ${currentLimit})`);
          break;
        }

        offset += currentLimit;

        // Safety check: prevent infinite loops
        if (offset > MAX_TOTAL_SWAPS) {
          console.warn(`[BirdeyeClient] ⚠️ Reached maximum offset limit, stopping`);
          break;
        }
      }

      console.log(`[BirdeyeClient] ✅ Successfully fetched ${allSwaps.length} swap transactions`);
      return allSwaps;

    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to fetch swap transactions:`, error.message);
      throw error;
    }
  }

  /**
   * Parse Birdeye swap transaction to our internal ParsedSwap format
   * Based on official Birdeye API documentation
   * 
   * @param tx Birdeye swap transaction
   * @param tokenMint Optional: Token mint for direction detection
   * @returns ParsedSwap or null if invalid
   */
  private parseBirdeyeSwap(
    tx: BirdeyeSwapTransaction,
    tokenMint?: string
  ): ParsedSwap | null {
    try {
      // Validate required fields (using correct field names)
      if (!tx.txHash || !tx.owner || !tx.blockUnixTime) {
        console.warn(`[BirdeyeClient] ⚠️ Missing required fields in transaction:`, {
          hasTxHash: !!tx.txHash,
          hasOwner: !!tx.owner,
          hasBlockUnixTime: !!tx.blockUnixTime,
        });
        return null;
      }

      // Convert timestamp from seconds to milliseconds
      const timestamp = tx.blockUnixTime * 1000;

      // Determine swap direction
      // Priority 1: Use API-provided 'side' field if available
      let direction: 'buy' | 'sell' = 'buy';
      
      if (tx.side === 'buy' || tx.side === 'sell') {
        direction = tx.side;
      } else if (tx.from && tx.to && tokenMint) {
        // Priority 2: Analyze from/to based on token mint
        // BUY = getting the token we're tracking (to.address === tokenMint)
        // SELL = sending the token we're tracking (from.address === tokenMint)
        if (tx.to.address.toLowerCase() === tokenMint.toLowerCase()) {
          direction = 'buy';
        } else if (tx.from.address.toLowerCase() === tokenMint.toLowerCase()) {
          direction = 'sell';
        }
      } else if (tx.from && tx.to) {
        // Priority 3: Generic detection using SOL as reference
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        if (tx.from.address.toLowerCase() === SOL_MINT.toLowerCase()) {
          direction = 'buy'; // SOL → Token
        } else if (tx.to.address.toLowerCase() === SOL_MINT.toLowerCase()) {
          direction = 'sell'; // Token → SOL
        }
      }

      // Parse amounts from from/to objects (raw format with ui_amount_mode=raw)
      const amountIn = tx.from?.amount ? BigInt(tx.from.amount) : BigInt(0);
      const amountOut = tx.to?.amount ? BigInt(tx.to.amount) : BigInt(0);
      
      // Calculate USD values from price data
      // Birdeye provides price per token in from/to objects
      const amountInUsd = tx.from?.price && tx.from?.uiAmount 
        ? tx.from.price * tx.from.uiAmount 
        : undefined;
      const amountOutUsd = tx.to?.price && tx.to?.uiAmount 
        ? tx.to.price * tx.to.uiAmount 
        : undefined;

      return {
        signature: tx.txHash,
        timestamp,
        wallet: tx.owner,
        direction,
        amountIn,
        amountOut,
        amountInUsd,
        amountOutUsd,
        priceImpact: undefined, // Birdeye doesn't provide this directly in txs endpoint
      };

    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to parse swap:`, error.message);
      console.error(`[BirdeyeClient] 🔍 Transaction sample:`, JSON.stringify(tx).substring(0, 300));
      return null;
    }
  }

  /**
   * Get pool/pair data from Birdeye API
   * 
   * @param pairAddress Trading pair address (pool address)
   * @returns Pool reserves and liquidity data
   */
  async getPoolData(pairAddress: string): Promise<AdjustedPoolReserves> {
    try {
      await this.rateLimit();

      const url = `${BIRDEYE_API_BASE}/defi/pair?address=${pairAddress}`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching pool data for: ${pairAddress}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      // Parse Birdeye pair data to our format
      // Note: Birdeye API response format may vary, adjust as needed
      const pairData = data.data || data;
      
      return {
        tokenAMint: pairData.baseToken?.address || pairData.token0?.address || '',
        tokenBMint: pairData.quoteToken?.address || pairData.token1?.address || '',
        tokenAReserve: parseFloat(pairData.liquidity?.base || pairData.reserve0 || '0'),
        tokenBReserve: parseFloat(pairData.liquidity?.quote || pairData.reserve1 || '0'),
        tokenASymbol: pairData.baseToken?.symbol || pairData.token0?.symbol,
        tokenBSymbol: pairData.quoteToken?.symbol || pairData.token1?.symbol,
        tvlUSD: parseFloat(pairData.liquidity?.usd || pairData.liquidityUSD || '0'),
        poolStatus: pairData.pairCreatedAt ? 'Active' : 'Unknown',
        feeInfo: pairData.fee || '0.3%',
        poolType: pairData.dexId || 'Unknown',
      };

    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to fetch pool data:`, error.message);
      throw error;
    }
  }

  /**
   * Get token metadata from Birdeye API
   * 
   * @param tokenMint Token mint address
   * @returns Token metadata
   */
  async getTokenMetadata(tokenMint: string): Promise<TokenMetadata> {
    try {
      await this.rateLimit();

      const url = `${BIRDEYE_API_BASE}/token/token_overview?address=${tokenMint}`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching token metadata for: ${tokenMint}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      // Parse Birdeye token data to our format
      const tokenData = data.data || data;
      
      return {
        mint: tokenMint,
        symbol: tokenData.symbol || 'UNKNOWN',
        name: tokenData.name || tokenData.symbol || 'Unknown Token',
        decimals: tokenData.decimals || 9,
        logoURI: tokenData.logoURI || tokenData.logo,
        authorities: {
          freezeAuthority: tokenData.freezeAuthority || null,
          mintAuthority: tokenData.mintAuthority || null,
        },
      };

    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to fetch token metadata:`, error.message);
      // Return minimal metadata on error
      return {
        mint: tokenMint,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 9,
      };
    }
  }

  /**
   * Validate pool exists (check if pair data is available)
   * 
   * Note: For Pump.fun pools, Birdeye may not have pair data but may have swap transactions
   * So we'll be lenient - if swap endpoint works, pool is valid
   * 
   * @param pairAddress Trading pair address
   * @returns True if pool exists (or if we can't verify, assume it exists)
   */
  async validatePoolExists(pairAddress: string): Promise<boolean> {
    try {
      await this.rateLimit();

      const url = `${BIRDEYE_API_BASE}/defi/pair?address=${pairAddress}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      // If pair endpoint works, pool exists
      if (response.ok) {
        return true;
      }

      // If 404, pool doesn't exist in Birdeye
      if (response.status === 404) {
        console.warn(`[BirdeyeClient] ⚠️ Pool not found in Birdeye pair endpoint: ${pairAddress}`);
        console.warn(`[BirdeyeClient] ⚠️ This may be a Pump.fun pool - will try swap endpoint anyway`);
        // For Pump.fun, we'll still try swap endpoint (it might work even if pair endpoint doesn't)
        return true; // Be lenient - let swap endpoint decide
      }

      // Other errors - assume pool exists and let swap endpoint handle it
      console.warn(`[BirdeyeClient] ⚠️ Pair endpoint returned ${response.status}, assuming pool exists`);
      return true;

    } catch (error: any) {
      console.warn(`[BirdeyeClient] ⚠️ Pool validation error: ${error.message}, assuming pool exists`);
      // Be lenient - assume pool exists and let swap endpoint decide
      return true;
    }
  }
}


