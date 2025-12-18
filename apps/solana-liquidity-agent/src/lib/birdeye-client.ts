/**
 * Birdeye Data Services API Client
 * 
 * Complete replacement for Helius API - all data from Birdeye
 * - Pool reserves & liquidity
 * - Token metadata
 * - Swap transaction history
 * Documentation: https://docs.birdeye.so/
 */

import type { ParsedSwap, TokenMetadata, AdjustedPoolReserves, Network } from './types';
import { parseEvmSwapTransaction, type EvmSwapTransaction } from './evm-transaction-parser';
import { getAddress } from 'ethers';

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
  private network: Network;

  constructor(network: Network = 'solana') {
    if (!BIRDEYE_API_KEY) {
      throw new Error('BIRDEYE_API_KEY environment variable is not set');
    }
    this.network = network;
  }

  /**
   * Get chain header value for Birdeye API
   * Maps Network type to Birdeye API chain identifier
   */
  private getChainHeader(): string {
    const chainMap: Record<Network, string> = {
      'solana': 'solana',
      'base': 'base',
      'bsc': 'bsc',
    };
    return chainMap[this.network];
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
    // For EVM chains, if pairAddress is a token address (starts with 0x and is 42 chars),
    // we should use token endpoint directly instead of trying pair endpoint first
    const isEvmTokenAddress = (this.network === 'base' || this.network === 'bsc') && 
                               pairAddress.startsWith('0x') && 
                               pairAddress.length === 42;
    
    // If it's an EVM token address and we don't have a separate tokenMint, use token address as tokenMint
    if (isEvmTokenAddress && !tokenMint) {
      tokenMint = pairAddress;
      console.log(`[BirdeyeClient] 🔍 Detected EVM token address, will use /defi/txs/token endpoint`);
    }
    
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
      // For EVM chains with token address, use token endpoint directly
      // For Solana or when we have a pool address, try pair endpoint first
      // 1. Pair v2 endpoint: /defi/txs/pair (for Solana or known pool addresses)
      // 2. Token v2 endpoint: /defi/txs/token (for EVM token addresses)
      let endpointStrategy: 'pair_v2' | 'token_v2' = 
        (isEvmTokenAddress && tokenMint) ? 'token_v2' : 'pair_v2';
      let lastError: any = null;
      let pairEndpointFailed = false; // Pair endpoint başarısız oldu mu?
      
      // ✅ Offset limit: Birdeye API supports up to 10,000 offset
      // Token endpoint supports up to 10,000 offset (200 pages * 50 per page)
      // ✅ DÜZELTME: Offset limit kontrolünü daha akıllı yap - token endpoint'te filtreleme yapıldığı için
      // daha fazla offset gerekebilir. Maksimum offset'e ulaştığımızda dur, ama hedef swap sayısına
      // ulaşmaya çalış.
      const MAX_OFFSET = 10000; // Maximum supported by Birdeye API
      let consecutiveEmptyBatches = 0; // Boş batch sayacı
      const MAX_EMPTY_BATCHES = 3; // 3 boş batch sonra dur

      while (allSwaps.length < targetLimit) {
        // ✅ Check offset limit before making request
        // ✅ DÜZELTME: Offset limit kontrolü - token endpoint'te filtreleme yapıldığı için
        // daha fazla offset gerekebilir, ama API limiti 10000. Eğer hedef swap sayısına ulaşmadıysak
        // ve offset limit'e ulaştıysak, uyarı verip dur.
        if (offset >= MAX_OFFSET) {
          console.log(`[BirdeyeClient] ⚠️ Offset limit reached (${MAX_OFFSET}), stopping pagination`);
          console.log(`[BirdeyeClient] ✅ Collected ${allSwaps.length} swaps (target was ${targetLimit})`);
          if (allSwaps.length < targetLimit) {
            console.log(`[BirdeyeClient] ⚠️ WARNING: Only collected ${allSwaps.length}/${targetLimit} swaps`);
            console.log(`[BirdeyeClient] ℹ️ Reason: Token endpoint filters by pool ID, so we need to fetch more total swaps to reach target`);
            console.log(`[BirdeyeClient] ℹ️ Birdeye API offset limit is ${MAX_OFFSET}, cannot fetch more`);
            console.log(`[BirdeyeClient] ℹ️ This pool may have fewer than ${targetLimit} swaps, or swaps are spread across higher offsets`);
          }
          break;
        }
        
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
        } else {
          // Fallback: use token endpoint if no tokenMint
          console.error(`[BirdeyeClient] ❌ No valid endpoint strategy and no token mint provided`);
          break;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-API-KEY': BIRDEYE_API_KEY,
            'x-chain': this.getChainHeader(),
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
          
          // ✅ DÜZELTME: If pair endpoint fails and we have tokenMint, try token endpoint
          if (endpointStrategy === 'pair_v2' && tokenMint && (response.status === 404 || response.status === 400)) {
            console.warn(`[BirdeyeClient] ⚠️ PAIR v2 endpoint failed (${response.status}), trying TOKEN v2 endpoint...`);
            console.warn(`[BirdeyeClient] ℹ️ Note: Token endpoint will filter by pool ID, so more offset may be needed to reach target`);
            endpointStrategy = 'token_v2';
            pairEndpointFailed = true;
            lastError = new Error(`Pair endpoint failed: ${response.status}`);
            offset = 0; // Reset offset for new endpoint
            allSwaps.length = 0; // Clear collected swaps (start fresh with token endpoint)
            continue; // Retry with token endpoint
          }
          
          // Standard plan may not have access to /defi/txs/pair endpoint
          if (response.status === 403 || response.status === 401) {
            throw new Error(`Birdeye API access denied. Standard plan may not support swap endpoints. Please upgrade to Lite plan.`);
          }
          
          // 422 Unprocessable Entity: Usually means invalid parameters (e.g., offset too large)
          if (response.status === 422) {
            console.warn(`[BirdeyeClient] ⚠️ API returned 422 (Unprocessable Entity) - likely offset too large or invalid params`);
            // If we have some swaps already, use them
            if (allSwaps.length > 0) {
              console.log(`[BirdeyeClient] ✅ Using ${allSwaps.length} swaps collected so far (stopped due to 422 error)`);
              break;
            }
            throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
          }
          
          // If token endpoint fails with 400/404, and we have tokenMint, we've exhausted options
          if (endpointStrategy === 'token_v2' && (response.status === 400 || response.status === 404)) {
            console.warn(`[BirdeyeClient] ⚠️ TOKEN v2 endpoint failed (${response.status}), no more fallback options`);
            // If we have some swaps already, use them
            if (allSwaps.length > 0) {
              console.log(`[BirdeyeClient] ✅ Using ${allSwaps.length} swaps collected so far`);
              break;
            }
            throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
          }
          
          // If we've tried both endpoints or don't have tokenMint, throw error
          if ((endpointStrategy === 'token_v2' && !tokenMint) || (endpointStrategy === 'pair_v2' && !tokenMint)) {
            throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
          }
          
          // Try next endpoint as fallback (only pair -> token)
          if (endpointStrategy === 'pair_v2' && tokenMint) {
            console.warn(`[BirdeyeClient] ⚠️ PAIR v2 failed, trying TOKEN v2...`);
            endpointStrategy = 'token_v2';
            offset = 0; // Reset offset for new endpoint
            continue;
          }
          
          // If we get here, we've exhausted all options
          throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
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
        if (endpointStrategy === 'token_v2') {
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
            } else if (endpointStrategy === 'token_v2') {
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
          .map(tx => {
            // Use EVM parser for Base/BSC, Solana parser for Solana
            if (this.network === 'base' || this.network === 'bsc') {
              return parseEvmSwapTransaction(tx as EvmSwapTransaction, 
                tokenMint ? { tokenA: tokenMint, tokenB: '' } : undefined, 
                this.network);
            } else {
              return this.parseBirdeyeSwap(tx, tokenMint);
            }
          })
          .filter((swap): swap is ParsedSwap => swap !== null);
        
        // Log filtering results
        if (endpointStrategy === 'pair_v2' && filteredCount > 0) {
          console.log(`[BirdeyeClient] 🔍 Filtered out ${filteredCount} swaps from other pools (PAIR endpoint)`);
        } else if (endpointStrategy === 'token_v2' && poolIdMatches > 0) {
          console.log(`[BirdeyeClient] ✅ Using ${poolIdMatches} swaps from target pool (pool ID matched)`);
          if (filteredCount > 0) {
            console.log(`[BirdeyeClient] 🔍 Filtered out ${filteredCount} swaps from other pools`);
          }
        } else if (endpointStrategy === 'token_v2') {
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

        // ✅ DÜZELTME: Token endpoint'te filtreleme yapıldığı için boş batch kontrolü ekle
        // Eğer hedef pool'dan swap gelmiyorsa, birkaç boş batch sonra dur
        if (parsedSwaps.length === 0) {
          consecutiveEmptyBatches++;
          console.log(`[BirdeyeClient] ⚠️ No swaps from target pool in this batch (${consecutiveEmptyBatches}/${MAX_EMPTY_BATCHES} consecutive empty batches)`);
          if (consecutiveEmptyBatches >= MAX_EMPTY_BATCHES) {
            console.log(`[BirdeyeClient] ⚠️ ${MAX_EMPTY_BATCHES} consecutive empty batches - stopping pagination`);
            console.log(`[BirdeyeClient] ℹ️ This may mean we've reached all available swaps for this pool, or need to continue with higher offset`);
            break;
          }
        } else {
          consecutiveEmptyBatches = 0; // Reset counter if we got swaps
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

      // Calculate token price at time of transaction (for profit pressure analysis)
      // For BUY: priceToken = amountInUsd / amountOut (how much USD per token)
      // For SELL: priceToken = amountOutUsd / amountIn (how much USD per token)
      let priceToken: number | undefined = undefined;
      if (direction === 'buy' && amountOutUsd && tx.to?.uiAmount && tx.to.uiAmount > 0) {
        priceToken = amountOutUsd / tx.to.uiAmount;
      } else if (direction === 'sell' && amountOutUsd && tx.from?.uiAmount && tx.from.uiAmount > 0) {
        priceToken = amountOutUsd / tx.from.uiAmount;
      } else if (tx.to?.price) {
        // Fallback: use price from API if available
        priceToken = tx.to.price;
      } else if (tx.from?.price && direction === 'sell') {
        // For sell, use from token price
        priceToken = tx.from.price;
      }

      // Extract slot if available (Birdeye may not provide this, but we'll try)
      // Note: Birdeye API doesn't typically include slot, but we can estimate from timestamp
      // Solana blocks are ~400ms apart, so we can approximate slot from timestamp
      // Slot = (timestamp - genesis_timestamp) / 0.4 (approximate)
      // For now, we'll use timestamp in seconds as a proxy for slot grouping
      const slot = undefined; // Will be calculated from timestamp grouping if needed

      // Signer: For now, use owner as signer (Birdeye doesn't provide separate signer field)
      // In Solana, owner is typically the signer, but for advanced detection we'd need RPC data
      const signer = tx.owner; // Default to owner, can be enhanced with RPC call if needed

      return {
        signature: tx.txHash,
        timestamp,
        slot, // Will be calculated from timestamp grouping
        wallet: tx.owner,
        signer, // Same as owner for now (can be enhanced)
        direction,
        amountIn,
        amountOut,
        amountInUsd,
        amountOutUsd,
        priceToken, // Token price at transaction time
        priceImpact: undefined, // Birdeye doesn't provide this directly in txs endpoint
      };

    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to parse swap:`, error.message);
      console.error(`[BirdeyeClient] 🔍 Transaction sample:`, JSON.stringify(tx).substring(0, 300));
      return null;
    }
  }

  /**
   * Get markets (pools) for a token using /defi/v2/markets endpoint
   * Returns all pools where the token is traded, sorted by liquidity
   * 
   * @param tokenAddress Token contract address (checksummed)
   * @returns Array of market data with pool addresses and liquidity info
   */
  async getTokenMarkets(tokenAddress: string): Promise<Array<{
    address: string; // Pool address
    source: string; // DEX name (e.g., 'aerodrome', 'pancakeswap')
    liquidity: number; // USD liquidity
    volume_24h?: number; // 24h volume
    price?: number; // Token price in this pool
  }>> {
    try {
      await this.rateLimit();

      // Ensure checksummed address
      const checksummedAddress = getAddress(tokenAddress.toLowerCase());
      
      const url = `${BIRDEYE_API_BASE}/defi/v2/markets?address=${checksummedAddress}&sort_by=liquidity&sort_type=desc`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching markets for token: ${checksummedAddress}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': this.getChainHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[BirdeyeClient] ⚠️ Markets API error (${response.status}):`, errorText.substring(0, 200));
        return [];
      }

      const data = await response.json();
      const markets = data.data || data.items || [];

      // Parse and return market data
      return markets.map((market: any) => ({
        address: market.address || market.pairAddress,
        source: market.source || market.dexId || 'unknown',
        liquidity: parseFloat(market.liquidity?.usd || market.liquidityUSD || '0'),
        volume_24h: market.volume_24h ? parseFloat(market.volume_24h) : undefined,
        price: market.price ? parseFloat(market.price) : undefined,
        marketCap: market.marketCap ? parseFloat(market.marketCap) : undefined, // Market cap from markets endpoint
        fdv: market.fdv ? parseFloat(market.fdv) : undefined, // FDV from markets endpoint
      }));
    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to get token markets:`, error.message);
      return [];
    }
  }

  /**
   * Get pool address and market data from token address (for EVM chains)
   * Uses /defi/v2/markets endpoint to find the most liquid pool
   * 
   * @param tokenAddress Token contract address
   * @returns Object with pool address and market data (marketCap, fdv) or null if not found
   */
  async getPoolAddressFromToken(tokenAddress: string): Promise<{ poolAddress: string; marketCap?: number; fdv?: number } | null> {
    try {
      // Use /defi/v2/markets endpoint to find pools
      const markets = await this.getTokenMarkets(tokenAddress);
      
      if (markets.length === 0) {
        console.warn(`[BirdeyeClient] ⚠️ No markets found for token: ${tokenAddress}`);
        return null;
      }

      // Filter by liquidity threshold (min $10,000) and get the most liquid pool
      const liquidMarkets = markets.filter(m => m.liquidity >= 10000);
      const bestMarket = liquidMarkets.length > 0 ? liquidMarkets[0] : markets[0];

      console.log(`[BirdeyeClient] ✅ Found ${markets.length} markets, selected most liquid: ${bestMarket.address} (${bestMarket.source}, $${bestMarket.liquidity.toLocaleString()} liquidity)`);
      if (bestMarket.marketCap) {
        console.log(`[BirdeyeClient] 📊 Market cap from markets: $${bestMarket.marketCap.toLocaleString()}`);
      }
      
      return {
        poolAddress: bestMarket.address,
        marketCap: bestMarket.marketCap,
        fdv: bestMarket.fdv,
      };
    } catch (error: any) {
      console.warn(`[BirdeyeClient] ⚠️ Failed to get pool address from token: ${error.message}`);
      return null;
    }
  }

  /**
   * Get pool/pair data from Birdeye API
   * For EVM chains, if pairAddress is a token address, try to find the pool first
   * 
   * @param pairAddress Trading pair address (pool address) or token address (for EVM)
   * @returns Pool reserves and liquidity data
   */
  async getPoolData(pairAddress: string): Promise<AdjustedPoolReserves> {
    try {
      await this.rateLimit();

      // For EVM chains, if pairAddress looks like a token address (starts with 0x and is 42 chars),
      // try to find the actual pool address first
      let actualPoolAddress = pairAddress;
      if (this.network === 'base' || this.network === 'bsc') {
        let marketCapFromMarkets: number | undefined = undefined;
        let fdvFromMarkets: number | undefined = undefined;
        
        if (pairAddress.startsWith('0x') && pairAddress.length === 42) {
          // This might be a token address, try to find the pool
          console.log(`[BirdeyeClient] 🔍 Detected token address, trying to find pool...`);
          const poolData = await this.getPoolAddressFromToken(pairAddress);
          if (poolData) {
            actualPoolAddress = poolData.poolAddress;
            marketCapFromMarkets = poolData.marketCap;
            fdvFromMarkets = poolData.fdv;
            console.log(`[BirdeyeClient] ✅ Found pool address: ${actualPoolAddress}`);
            if (marketCapFromMarkets) {
              console.log(`[BirdeyeClient] 📊 Market cap from markets endpoint: $${marketCapFromMarkets.toLocaleString()}`);
            }
          } else {
            console.warn(`[BirdeyeClient] ⚠️ Could not find pool from token address, will try token market data endpoint`);
          }
        }
        
        // Ensure checksummed address for EVM chains
        try {
          actualPoolAddress = getAddress(actualPoolAddress.toLowerCase());
        } catch (error) {
          // If checksum fails, use as-is (might be invalid address)
          console.warn(`[BirdeyeClient] ⚠️ Failed to checksum address: ${actualPoolAddress}`);
        }
      }

      const url = `${BIRDEYE_API_BASE}/defi/pair?address=${actualPoolAddress}`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching pool data for: ${actualPoolAddress}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': this.getChainHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // For EVM chains, if pair endpoint fails, try to get pool data from token market data
        if ((this.network === 'base' || this.network === 'bsc') && response.status === 404) {
          console.log(`[BirdeyeClient] ⚠️ Pair endpoint 404, trying token market data endpoint...`);
          return await this.getPoolDataFromTokenMarketData(pairAddress);
        }
        
        const errorText = await response.text();
        throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      // Parse Birdeye pair data to our format
      // Note: Birdeye API response format may vary, adjust as needed
      const pairData = data.data || data;
      
      const tokenAReserve = parseFloat(pairData.liquidity?.base || pairData.reserve0 || '0');
      const tokenBReserve = parseFloat(pairData.liquidity?.quote || pairData.reserve1 || '0');
      
      // Try to get LP supply from API, otherwise calculate from reserves
      let lpSupply: string | undefined = undefined;
      if (pairData.lpSupply !== undefined && pairData.lpSupply !== null) {
        lpSupply = String(pairData.lpSupply);
      } else if (pairData.liquidity?.lpSupply !== undefined && pairData.liquidity?.lpSupply !== null) {
        lpSupply = String(pairData.liquidity.lpSupply);
      } else if (tokenAReserve > 0 && tokenBReserve > 0) {
        // Calculate approximate LP supply from reserves (simplified AMM formula)
        // LP supply ≈ sqrt(tokenA * tokenB) for constant product AMMs
        const calculatedLP = Math.sqrt(tokenAReserve * tokenBReserve);
        lpSupply = calculatedLP.toLocaleString('en-US', { maximumFractionDigits: 0 });
      }
      
      // Use market cap from markets endpoint if available, otherwise try pair endpoint
      const marketCap = marketCapFromMarkets || (pairData.marketCap ? parseFloat(pairData.marketCap) : (pairData.market_cap ? parseFloat(pairData.market_cap) : undefined));
      const fdv = fdvFromMarkets || (pairData.fdv ? parseFloat(pairData.fdv) : (pairData.fully_diluted_valuation ? parseFloat(pairData.fully_diluted_valuation) : undefined));
      
      return {
        tokenAMint: pairData.baseToken?.address || pairData.token0?.address || '',
        tokenBMint: pairData.quoteToken?.address || pairData.token1?.address || '',
        tokenAReserve,
        tokenBReserve,
        tokenASymbol: pairData.baseToken?.symbol || pairData.token0?.symbol,
        tokenBSymbol: pairData.quoteToken?.symbol || pairData.token1?.symbol,
        tvlUSD: parseFloat(pairData.liquidity?.usd || pairData.liquidityUSD || '0'),
        marketCap, // Use market cap from markets endpoint or pair endpoint
        fdv, // Use FDV from markets endpoint or pair endpoint
        lpSupply,
        lpMint: pairData.lpMint || pairData.liquidity?.lpMint,
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
   * Get pool data from token market data endpoint (for EVM chains when pair endpoint fails)
   * 
   * @param tokenAddress Token contract address
   * @returns Pool reserves and liquidity data
   */
  async getPoolDataFromTokenMarketData(tokenAddress: string): Promise<AdjustedPoolReserves> {
    try {
      await this.rateLimit();

      // Try /defi/v3/token/market-data endpoint
      const url = `${BIRDEYE_API_BASE}/defi/v3/token/market-data?address=${tokenAddress}`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching token market data for: ${tokenAddress}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': this.getChainHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Birdeye API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const marketData = data.data || data;

      // Extract pool information from market data
      // Note: This is a fallback, so we'll use minimal data
      return {
        tokenAMint: tokenAddress, // We don't know the other token from market data
        tokenBMint: '', // Will be filled from swap transactions
        tokenAReserve: 0,
        tokenBReserve: 0,
        tokenASymbol: marketData.symbol || 'UNKNOWN',
        tokenBSymbol: '',
        tvlUSD: parseFloat(marketData.liquidity || marketData.liquidityUSD || '0'),
        marketCap: marketData.marketCap ? parseFloat(marketData.marketCap) : undefined, // Use market cap from API if available
        fdv: marketData.fdv ? parseFloat(marketData.fdv) : undefined, // Use FDV from API if available
        lpSupply: undefined,
        poolStatus: 'Active',
        poolType: 'Unknown',
      };
    } catch (error: any) {
      console.error(`[BirdeyeClient] ❌ Failed to get pool data from token market data:`, error.message);
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

      // ✅ DÜZELTME: Birdeye API endpoint - /defi/token_overview kullan (swap endpoint'leri gibi)
      // Eğer bu çalışmazsa, /token/token_overview veya /v1/token_overview deneyebiliriz
      const url = `${BIRDEYE_API_BASE}/defi/token_overview?address=${tokenMint}`;
      
      console.log(`[BirdeyeClient] 🔍 Fetching token metadata for: ${tokenMint}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': this.getChainHeader(),
          'Content-Type': 'application/json',
        },
      });

      // ✅ DÜZELTME: Response'u text olarak oku (HTML kontrolü için)
      const responseText = await response.text();
      
      // ✅ DÜZELTME: HTML response kontrolü - eğer HTML dönüyorsa endpoint yanlış veya yetkisiz
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn(`[BirdeyeClient] ⚠️ Token metadata endpoint returned HTML instead of JSON (status: ${response.status})`);
        console.warn(`[BirdeyeClient] ⚠️ This usually means the endpoint is not available or requires higher API tier`);
        console.warn(`[BirdeyeClient] ⚠️ Falling back to minimal metadata (this is not critical for analysis)`);
        // Return minimal metadata - this is not critical for analysis
        return {
          mint: tokenMint,
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: 9,
        };
      }
      
      if (!response.ok) {
        console.warn(`[BirdeyeClient] ⚠️ Token metadata API error: ${response.status} ${response.statusText}`);
        console.warn(`[BirdeyeClient] ⚠️ Error response: ${responseText.substring(0, 200)}`);
        console.warn(`[BirdeyeClient] ⚠️ Falling back to minimal metadata (this is not critical)`);
        // Return minimal metadata instead of throwing error - this is not critical
        return {
          mint: tokenMint,
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: 9,
        };
      }

      // ✅ DÜZELTME: Response text zaten yukarıda okundu, şimdi parse et
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError: any) {
        console.warn(`[BirdeyeClient] ⚠️ Failed to parse JSON response for token metadata`);
        console.warn(`[BirdeyeClient] ⚠️ Response text (first 200 chars): ${responseText.substring(0, 200)}`);
        console.warn(`[BirdeyeClient] ⚠️ Falling back to minimal metadata (this is not critical)`);
        // Return minimal metadata instead of throwing error
        return {
          mint: tokenMint,
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: 9,
        };
      }
      
      // Parse Birdeye token data to our format
      const tokenData = data.data || data;
      
      // Extract market cap from token overview if available
      const marketCap = tokenData.marketCap || tokenData.market_cap || tokenData.mc || undefined;
      const fdv = tokenData.fdv || tokenData.fully_diluted_valuation || undefined;
      
      if (marketCap) {
        console.log(`[BirdeyeClient] 📊 Market cap from token_overview: $${parseFloat(marketCap).toLocaleString()}`);
      }
      
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
        marketCap: marketCap ? parseFloat(marketCap) : undefined, // Market cap from token overview
        fdv: fdv ? parseFloat(fdv) : undefined, // FDV from token overview
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
          'x-chain': this.getChainHeader(),
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


