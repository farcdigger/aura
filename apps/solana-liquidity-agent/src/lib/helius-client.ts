import { Helius } from 'helius-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import type {
  TokenMetadata,
  PoolReserves,
  TransactionSummary,
  WalletActivity,
  AdjustedPoolReserves,
} from './types';
import { 
  parseRaydiumPoolWithReserves, 
  evaluatePoolHealth, 
  formatReserves,
  calculateTVL 
} from './raydium-parser';
import { 
  parseCLMMPoolWithReserves, 
  calculateCLMMTVL, 
  assessCLMMPoolHealth 
} from './clmm-parser';
import { 
  parseOrcaWhirlpoolWithReserves, 
  calculateOrcaTVL, 
  assessOrcaPoolHealth 
} from './orca-parser';
import { 
  parseMeteoraLBPairWithReserves, 
  calculateMeteoraTVL, 
  assessMeteoraPoolHealth 
} from './meteora-parser';
import {
  parsePumpfunPoolWithReserves,
  assessPumpfunPoolHealth
} from './pumpfun-parser';
import { 
  detectPoolType, 
  PoolType, 
  getPoolTypeName 
} from './pool-detector';
import { 
  parseSwapTransaction, 
  analyzeTransactions,
  simplifiedTransactionAnalysis 
} from './transaction-parser';
import { calculatePoolTVL } from './price-fetcher';
import type { ParsedSwap } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Transaction limits
const DEFAULT_TX_LIMIT = 2000; // Phase 3: Balanced for quality vs rate limits
const MAX_TX_LIMIT = 1000; // Helius limit per request (pagination used for higher limits)

// =============================================================================
// HELIUS CLIENT CLASS
// =============================================================================

export class HeliusClient {
  private helius: Helius;
  private connection: Connection;

  constructor() {
    if (!HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }

    this.helius = new Helius(HELIUS_API_KEY);
    this.connection = new Connection(HELIUS_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    console.log('[HeliusClient] ✅ Initialized with RPC:', HELIUS_RPC_URL.substring(0, 50) + '...');
  }

  // ===========================================================================
  // TOKEN METADATA (DAS API)
  // ===========================================================================

  /**
   * Fetch token metadata using Helius DAS API
   * @param mintAddress Token mint address
   * @returns Token metadata including symbol, name, decimals
   */
  async getTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
    try {
      console.log(`[HeliusClient] Fetching metadata for token: ${mintAddress}`);

      const asset = await this.helius.rpc.getAsset({
        id: mintAddress,
        displayOptions: {
          showFungible: true,
        },
      });

      // Extract token info
      const tokenInfo = asset.token_info;
      const content = asset.content;
      const ownership = asset.ownership;

      // Check for authorities (rug pull detection)
      const authorities = {
        freezeAuthority: (ownership as any)?.freeze_authority || null,
        mintAuthority: (ownership as any)?.mint_authority || ownership?.owner || null,
      };

      const metadata: TokenMetadata = {
        mint: mintAddress,
        symbol: tokenInfo?.symbol || content?.metadata?.symbol || 'UNKNOWN',
        name: content?.metadata?.name || tokenInfo?.symbol || 'Unknown Token',
        decimals: tokenInfo?.decimals ?? 9, // Default to 9 for SPL tokens
        logoURI: content?.links?.image || content?.files?.[0]?.uri,
        authorities,
      };

      console.log(`[HeliusClient] ✅ Token metadata: ${metadata.symbol} (${metadata.name})`);
      return metadata;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to fetch metadata for ${mintAddress}:`, error.message);
      
      // Fallback metadata
      return {
        mint: mintAddress,
        symbol: 'TOKEN',
        name: 'Unknown Token',
        decimals: 9,
        authorities: {
          freezeAuthority: null,
          mintAuthority: null,
        },
      };
    }
  }

  /**
   * Fetch multiple token metadata in batch
   * @param mintAddresses Array of mint addresses
   * @returns Array of token metadata
   */
  async getTokenMetadataBatch(mintAddresses: string[]): Promise<TokenMetadata[]> {
    console.log(`[HeliusClient] Fetching batch metadata for ${mintAddresses.length} tokens`);
    
    // Helius supports batch requests but we'll do sequential for now to avoid rate limits
    const metadataPromises = mintAddresses.map(mint => this.getTokenMetadata(mint));
    return await Promise.all(metadataPromises);
  }

  // ===========================================================================
  // POOL ACCOUNT DATA (RPC)
  // ===========================================================================

  /**
   * Fetch raw pool account data from Solana
   * Note: This returns raw data that needs to be deserialized with Raydium SDK
   * @param poolAddress Pool account address
   * @returns Raw account info
   */
  async getPoolAccountInfo(poolAddress: string) {
    try {
      console.log(`[HeliusClient] Fetching pool account: ${poolAddress}`);

      const poolPubkey = new PublicKey(poolAddress);
      const accountInfo = await this.connection.getAccountInfo(poolPubkey);

      if (!accountInfo || !accountInfo.data) {
        throw new Error(`Pool account not found: ${poolAddress}`);
      }

      console.log(`[HeliusClient] ✅ Pool account data size: ${accountInfo.data.length} bytes`);
      
      return {
        data: accountInfo.data,
        owner: accountInfo.owner.toBase58(),
        lamports: accountInfo.lamports,
        executable: accountInfo.executable,
      };

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to fetch pool account:`, error.message);
      throw error;
    }
  }

  /**
   * Parse Raydium pool reserves from account data
   * ✅ HYBRID SUPPORT: Automatically detects and parses both AMM V4 and CLMM pools
   */
  async getPoolReserves(poolAddress: string): Promise<AdjustedPoolReserves> {
    try {
      console.log(`[HeliusClient] 🔍 Fetching pool reserves for ${poolAddress}`);

      // Fetch pool account data from Solana
      const accountInfo = await this.getPoolAccountInfo(poolAddress);

      if (!accountInfo || !accountInfo.data) {
        throw new Error(`Pool account not found: ${poolAddress}`);
      }

      // ✅ AUTO-DETECT pool type (V4 or CLMM)
      const detection = await detectPoolType(this.connection, poolAddress);
      console.log(`[HeliusClient] 🎯 Pool Type: ${getPoolTypeName(detection.type)}`);
      console.log(`[HeliusClient] 🎯 Detection Confidence: ${detection.confidence}`);

      // Variables for both pool types
      let parsedPool: any;
      let health: any;
      let tokenAReserve: number;
      let tokenBReserve: number;
      let feeInfo: string;
      let poolStatus: string;
      let lpMint: string = '';
      let lpSupply: string = '0';

      // ====================================================================
      // PARSE BASED ON DETECTED TYPE
      // ====================================================================

      if (detection.type === PoolType.RAYDIUM_AMM_V4) {
        // ========== RAYDIUM AMM V4 ==========
        console.log(`[HeliusClient] 📦 Parsing as Raydium AMM V4...`);
        
        parsedPool = await parseRaydiumPoolWithReserves(this.connection, accountInfo.data);
        health = evaluatePoolHealth(parsedPool);
        
        tokenAReserve = Number(parsedPool.tokenAReserve) / (10 ** parsedPool.tokenADecimals);
        tokenBReserve = Number(parsedPool.tokenBReserve) / (10 ** parsedPool.tokenBDecimals);
        
        const formattedReserves = formatReserves(parsedPool);
        feeInfo = formattedReserves.feePercent;
        poolStatus = health.statusText;
        lpMint = parsedPool.lpMint;
        lpSupply = parsedPool.lpSupply.toString();

        console.log(`[HeliusClient] ✅ Parsed Raydium AMM V4 successfully`);

      } else if (detection.type === PoolType.RAYDIUM_CLMM) {
        // ========== RAYDIUM CLMM ==========
        console.log(`[HeliusClient] 📦 Parsing as Raydium CLMM...`);
        
        parsedPool = await parseCLMMPoolWithReserves(this.connection, accountInfo.data);
        health = assessCLMMPoolHealth(parsedPool);
        
        tokenAReserve = Number(parsedPool.tokenAReserve) / (10 ** parsedPool.tokenADecimals);
        tokenBReserve = Number(parsedPool.tokenBReserve) / (10 ** parsedPool.tokenBDecimals);
        
        feeInfo = parsedPool.feeRate ? `${(parsedPool.feeRate / 100).toFixed(2)}%` : 'Variable';
        poolStatus = health.status;
        // CLMM doesn't have traditional LP tokens
        lpMint = 'N/A (CLMM)';
        lpSupply = parsedPool.liquidity ? parsedPool.liquidity.toString() : '0';

        console.log(`[HeliusClient] ✅ Parsed Raydium CLMM successfully`);

      } else if (detection.type === PoolType.ORCA_WHIRLPOOL) {
        // ========== ORCA WHIRLPOOL ==========
        console.log(`[HeliusClient] 📦 Parsing as Orca Whirlpool...`);
        
        parsedPool = await parseOrcaWhirlpoolWithReserves(this.connection, accountInfo.data);
        health = assessOrcaPoolHealth(parsedPool);
        
        tokenAReserve = Number(parsedPool.tokenAReserve) / (10 ** parsedPool.tokenADecimals);
        tokenBReserve = Number(parsedPool.tokenBReserve) / (10 ** parsedPool.tokenBDecimals);
        
        feeInfo = parsedPool.feeRate ? `${(parsedPool.feeRate / 10000).toFixed(4)}%` : 'Variable';
        poolStatus = health.status;
        lpMint = 'N/A (Whirlpool)';
        lpSupply = parsedPool.liquidity ? parsedPool.liquidity.toString() : '0';

        console.log(`[HeliusClient] ✅ Parsed Orca Whirlpool successfully`);

      } else if (detection.type === PoolType.METEORA_DLMM) {
        // ========== METEORA DLMM ==========
        console.log(`[HeliusClient] 📦 Parsing as Meteora DLMM...`);
        
        parsedPool = await parseMeteoraLBPairWithReserves(this.connection, accountInfo.data);
        health = assessMeteoraPoolHealth(parsedPool);
        
        tokenAReserve = Number(parsedPool.tokenXReserve) / (10 ** parsedPool.tokenXDecimals);
        tokenBReserve = Number(parsedPool.tokenYReserve) / (10 ** parsedPool.tokenYDecimals);
        
        feeInfo = parsedPool.baseFeeRate ? `${(parsedPool.baseFeeRate / 100).toFixed(2)}%` : 'Dynamic';
        poolStatus = health.status;
        lpMint = 'N/A (DLMM)';
        lpSupply = '0'; // DLMM uses bins, not traditional LP

        // Normalize field names (Meteora uses X/Y instead of A/B)
        parsedPool.tokenAMint = parsedPool.tokenXMint;
        parsedPool.tokenBMint = parsedPool.tokenYMint;

        console.log(`[HeliusClient] ✅ Parsed Meteora DLMM successfully`);

      } else if (detection.type === PoolType.PUMPFUN_BONDING_CURVE) {
        // ========== PUMP.FUN BONDING CURVE ==========
        console.log(`[HeliusClient] 📦 Parsing as Pump.fun Bonding Curve...`);
        
        parsedPool = await parsePumpfunPoolWithReserves(this.connection, accountInfo.data);
        health = assessPumpfunPoolHealth(parsedPool);
        
        // Pump.fun always pairs with SOL
        tokenAReserve = Number(parsedPool.realSolReserves) / 1e9; // SOL decimals = 9
        tokenBReserve = Number(parsedPool.realTokenReserves) / (10 ** parsedPool.tokenDecimals);
        
        feeInfo = '1.0% (Pump.fun standard)';
        poolStatus = health.status;
        lpMint = 'N/A (Bonding Curve)';
        lpSupply = '0';

        console.log(`[HeliusClient] ✅ Parsed Pump.fun Bonding Curve successfully`);
        console.log(`[HeliusClient] 🎯 Bonding Curve Complete: ${parsedPool.complete ? 'YES (Migrated)' : 'NO (Active)'}`);

      } else {
        // ========== UNKNOWN TYPE ==========
        throw new Error(`Unsupported pool type: ${detection.reason}`);
      }

      // ====================================================================
      // COMMON PROCESSING (WORKS FOR BOTH V4 AND CLMM)
      // ====================================================================

      // Health check logging
      const isHealthy = health.status === 'Healthy' || health.isHealthy === true;
      console.log(`[HeliusClient] Pool health: ${isHealthy ? '✅ Healthy' : '⚠️ Issues detected'}`);
      console.log(`[HeliusClient] Status: ${poolStatus}`);
      
      if (health.issues && health.issues.length > 0) {
        console.warn(`[HeliusClient] Issues: ${health.issues.join(', ')}`);
      }

      // Fetch token metadata (DAS API)
      console.log(`[HeliusClient] 🔍 Fetching token metadata...`);
      const [tokenAMetadata, tokenBMetadata] = await Promise.all([
        this.getTokenMetadata(parsedPool.tokenAMint),
        this.getTokenMetadata(parsedPool.tokenBMint),
      ]);

      // Calculate TVL with real USD prices
      console.log(`[HeliusClient] 💰 Calculating TVL...`);
      let tvlUSD = 0;
      try {
        tvlUSD = await calculatePoolTVL(
          tokenAMetadata.symbol,
          tokenAReserve,
          tokenBMetadata.symbol,
          tokenBReserve
        );
        console.log(`[HeliusClient] ✅ TVL: $${tvlUSD.toLocaleString()}`);
      } catch (error: any) {
        console.warn(`[HeliusClient] ⚠️ Failed to calculate TVL:`, error.message);
        tvlUSD = 0;
      }

      // Log pool info
      console.log(`[HeliusClient] Token A Reserve: ${tokenAReserve.toLocaleString()} ${tokenAMetadata.symbol}`);
      console.log(`[HeliusClient] Token B Reserve: ${tokenBReserve.toLocaleString()} ${tokenBMetadata.symbol}`);
      console.log(`[HeliusClient] Price Ratio: ${(tokenBReserve / tokenAReserve).toFixed(6)}`);
      console.log(`[HeliusClient] Swap Fee: ${feeInfo}`);

      // ✅ Return unified adjusted reserves
      const adjustedReserves: AdjustedPoolReserves = {
        tokenAMint: parsedPool.tokenAMint,
        tokenBMint: parsedPool.tokenBMint,
        tokenAReserve,
        tokenBReserve,
        tokenASymbol: tokenAMetadata.symbol,
        tokenBSymbol: tokenBMetadata.symbol,
        tokenAAmount: tokenAReserve,
        tokenBAmount: tokenBReserve,
        tvlUSD: tvlUSD > 0 ? tvlUSD : undefined,
        lpMint,
        lpSupply,
        poolStatus,
        feeInfo,
        estimatedTVL: tvlUSD > 0 ? tvlUSD : undefined,
        poolType: getPoolTypeName(detection.type), // NEW: Pool type info
      };

      console.log(`[HeliusClient] ✅ Pool reserves ready`);
      return adjustedReserves;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to parse pool reserves:`, error.message);
      throw error;
    }
  }

  // ===========================================================================
  // TRANSACTION HISTORY (RPC)
  // ===========================================================================

  /**
   * Fetch transaction signatures for an address (with pagination support)
   * @param address Pool or wallet address
   * @param limit Number of transactions to fetch (default: 1000, can be higher with pagination)
   * @returns Array of transaction signatures with metadata
   */
  async getTransactionSignatures(address: string, limit: number = DEFAULT_TX_LIMIT) {
    try {
      const pubkey = new PublicKey(address);
      const signatures: any[] = [];
      let lastSignature: string | undefined;
      const batchSize = MAX_TX_LIMIT; // 1000 per batch
      
      console.log(`[HeliusClient] Fetching up to ${limit} transaction signatures for: ${address}`);

      // Fetch in batches if limit > 1000
      while (signatures.length < limit) {
        const remaining = limit - signatures.length;
        const currentLimit = Math.min(remaining, batchSize);
        
        const batch = await this.connection.getSignaturesForAddress(pubkey, {
          limit: currentLimit,
          before: lastSignature,
        });

        if (batch.length === 0) {
          break; // No more transactions available
        }

        signatures.push(...batch);
        lastSignature = batch[batch.length - 1].signature;
        
        // If we got fewer than requested, we've reached the end
        if (batch.length < currentLimit) {
          break;
        }
      }

      console.log(`[HeliusClient] ✅ Found ${signatures.length} transactions`);
      return signatures;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to fetch transaction signatures:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze transaction history for a pool
   * 
   * NEW APPROACH: Instead of fetching transactions from pool address,
   * we fetch from DEX program IDs and filter by pool
   * 
   * @param poolAddress Pool address (used for filtering)
   * @param limit Number of transactions to analyze (default: 100)
   * @param programId Optional: specific DEX program ID to query
   * @returns Transaction summary with buy/sell analysis
   */
  async getTransactionHistory(
    poolAddress: string,
    limit: number = 100,
    programId?: string
  ): Promise<TransactionSummary> {
    try {
      console.log(`[HeliusClient] 🔍 Analyzing transaction history for pool: ${poolAddress}`);
      console.log(`[HeliusClient] Fetching up to ${limit} transactions...`);

      // Step 1: Try to get pool info (optional - helps with direction detection)
      let poolTokenMints: { tokenA: string; tokenB: string } | undefined;
      try {
        const reserves = await this.getPoolReserves(poolAddress);
        poolTokenMints = {
          tokenA: reserves.tokenAMint,
          tokenB: reserves.tokenBMint,
        };
        console.log(`[HeliusClient] ✅ Pool tokens: ${poolTokenMints.tokenA} / ${poolTokenMints.tokenB}`);
      } catch (error: any) {
        console.warn(`[HeliusClient] ⚠️ Pool reserves not available, using instruction-based detection only`);
        // Continue without pool context - instruction-based parsing will still work
      }

      // Step 2: Try fetching transactions directly from pool address first
      console.log(`[HeliusClient] Attempting to fetch transactions from pool address...`);
      let signatures = await this.getTransactionSignatures(poolAddress, limit);
      
      // Step 2.5: If no transactions found on pool address, try program-based approach
      if (signatures.length === 0 && programId) {
        console.log(`[HeliusClient] No transactions on pool address, trying program ID: ${programId}...`);
        try {
          signatures = await this.getTransactionSignatures(programId, Math.min(limit * 2, 200));
          console.log(`[HeliusClient] ✅ Found ${signatures.length} transactions on program`);
          console.log(`[HeliusClient] Will filter for pool: ${poolAddress}`);
        } catch (err: any) {
          console.error(`[HeliusClient] Failed to fetch from program ID: ${err.message}`);
        }
      }
      
      if (signatures.length === 0) {
        console.log('[HeliusClient] No transactions found for this pool');
        return {
          totalCount: 0,
          totalTransactions: 0,
          buyCount: 0,
          sellCount: 0,
          avgVolumeUSD: 0,
          uniqueWallets: 0,
          topWallets: [],
          topTraders: [],
          suspiciousPatterns: [],
          summary: 'No transactions found',
        };
      }

      console.log(`[HeliusClient] Parsing ${signatures.length} transactions...`);

      // Step 3: Parse each transaction (with rate limiting to avoid overwhelming Helius)
      const parsedSwaps: ParsedSwap[] = [];
      const batchSize = 5; // Small batches to avoid rate limits
      const maxTransactionsToParse = Math.min(limit, signatures.length); // Use full limit for quality analysis

      console.log(`[HeliusClient] ⏳ Parsing in batches of ${batchSize} (this may take a while)...`);

      for (let i = 0; i < maxTransactionsToParse; i += batchSize) {
        const batch = signatures.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async (sig) => {
            try {
              const tx = await this.getParsedTransaction(sig.signature);
              if (!tx) return null;
              
              return parseSwapTransaction(tx, poolTokenMints);
            } catch (error: any) {
              // Silently skip failed transactions to avoid log spam
              return null;
            }
          })
        );

        // Collect successfully parsed swaps
        batchResults.forEach(swap => {
          if (swap) parsedSwaps.push(swap);
        });

        // Progress indicator every 100 transactions
        if ((i + batchSize) % 100 === 0 || i + batchSize >= maxTransactionsToParse) {
          console.log(`[HeliusClient] 📊 Progress: ${Math.min(i + batchSize, maxTransactionsToParse)}/${maxTransactionsToParse} transactions processed`);
        }

        // Longer delay between batches to respect rate limits
        if (i + batchSize < maxTransactionsToParse) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
        }
      }

      console.log(`[HeliusClient] ✅ Successfully parsed ${parsedSwaps.length}/${maxTransactionsToParse} transactions`);

      // Step 4: Analyze parsed transactions
      const summary = analyzeTransactions(parsedSwaps);

      console.log(`[HeliusClient] ✅ Transaction analysis complete:`);
      console.log(`   - Total analyzed: ${summary.totalCount}`);
      console.log(`   - Buys: ${summary.buyCount} (${((summary.buyCount / summary.totalCount) * 100).toFixed(1)}%)`);
      console.log(`   - Sells: ${summary.sellCount} (${((summary.sellCount / summary.totalCount) * 100).toFixed(1)}%)`);
      console.log(`   - Unique wallets: ${summary.uniqueWallets}`);
      console.log(`   - Suspicious patterns: ${summary.suspiciousPatterns.length}`);

      // Step 5: PHASE 3 - Wallet Profiling (Top 5 traders only)
      if (summary.topTraders && summary.topTraders.length > 0) {
        console.log(`[HeliusClient] 🔍 PHASE 3: Profiling top ${Math.min(5, summary.topTraders.length)} wallets...`);
        try {
          const { batchProfileWallets } = await import('./wallet-profiler');
          
          // Profile top 5 traders
          const topWalletsToProfile = summary.topTraders.slice(0, 5).map(t => t.wallet);
          const poolTransactionCounts = new Map(
            summary.topTraders.map(t => [t.wallet, t.buyCount + t.sellCount])
          );
          
          const walletProfiles = await batchProfileWallets(
            this.connection,
            topWalletsToProfile,
            poolTransactionCounts,
            summary.totalCount
          );
          
          summary.walletProfiles = walletProfiles;
          console.log(`[HeliusClient] ✅ Profiled ${walletProfiles.length} wallets`);
        } catch (error: any) {
          console.warn(`[HeliusClient] ⚠️ Wallet profiling failed: ${error.message}`);
          // Continue without wallet profiles
        }
      }

      return summary;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to analyze transaction history:`, error.message);
      throw error;
    }
  }

  /**
   * Get detailed transaction data (slower, use sparingly)
   * @param signature Transaction signature
   * @returns Parsed transaction data
   */
  async getParsedTransaction(signature: string) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      return tx;
    } catch (error: any) {
      console.error(`[HeliusClient] Failed to get transaction ${signature}:`, error.message);
      return null;
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Check if an address is valid Solana address
   */
  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current slot (for debugging)
   */
  async getCurrentSlot(): Promise<number> {
    return await this.connection.getSlot();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.getCurrentSlot();
      console.log(`[HeliusClient] ✅ Health check OK - Current slot: ${slot}`);
      return true;
    } catch (error) {
      console.error('[HeliusClient] ❌ Health check failed:', error);
      return false;
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let heliusClientInstance: HeliusClient | null = null;

/**
 * Get or create Helius client singleton
 */
export function getHeliusClient(): HeliusClient {
  if (!heliusClientInstance) {
    heliusClientInstance = new HeliusClient();
  }
  return heliusClientInstance;
}

// Export singleton instance
export const heliusClient = getHeliusClient();

