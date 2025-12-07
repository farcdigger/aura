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
import { BirdeyeClient } from './birdeye-client';

// =============================================================================
// CONSTANTS
// =============================================================================

const HELIUS_ENHANCED_API_BASE = 'https://api.helius.xyz/v0';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Transaction limits
const DEFAULT_TX_LIMIT = 500; // Test phase: 500 swaps (suitable for Standard plan)
const MAX_TX_LIMIT = 1000; // Helius limit per request (pagination used for higher limits)

// Enhanced Transaction API response types
interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  slot: number;
  type: string; // 'SWAP', 'TRANSFER', etc.
  source?: string; // 'RAYDIUM', 'ORCA', 'PUMP_FUN', etc.
  fee: number;
  feePayer: string;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      userAccount: string;
    }>;
  }>;
}

// =============================================================================
// HELIUS CLIENT CLASS
// =============================================================================

export class HeliusClient {
  private helius: Helius;
  private birdeyeClient?: BirdeyeClient;
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

    // Initialize Birdeye client for swap transaction history (REQUIRED - no Helius fallback)
    try {
      this.birdeyeClient = new BirdeyeClient();
      console.log('[HeliusClient] ✅ Birdeye client initialized (REQUIRED - no Helius fallback)');
    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Birdeye client initialization failed: ${error.message}`);
      throw new Error(`Birdeye client is required. Please set BIRDEYE_API_KEY in .env file. Error: ${error.message}`);
    }

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
  async getPoolReserves(poolAddress: string, tokenMint?: string): Promise<AdjustedPoolReserves> {
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
        
        parsedPool = await parsePumpfunPoolWithReserves(this.connection, accountInfo.data, tokenMint);
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
  // TRANSACTION HISTORY (ENHANCED API)
  // ===========================================================================

  /**
   * Fetch SWAP transactions using Helius Enhanced Transaction API
   * 
   * This is MUCH faster and more reliable than parsing raw transactions!
   * - Pre-parsed swap data
   * - Only returns SWAP transactions (no noise)
   * - Supports pagination for large datasets
   * 
   * @param poolAddress Pool address to fetch swaps for
   * @param limit Maximum number of swap transactions to fetch (default: 2000)
   * @returns Array of enhanced transactions (SWAP only)
   */
  private async getEnhancedTransactions(
    poolAddress: string,
    limit: number = 2000
  ): Promise<HeliusEnhancedTransaction[]> {
    try {
      console.log(`[HeliusClient] 🔍 Fetching Enhanced Transactions (SWAP only) for pool: ${poolAddress}`);
      console.log(`[HeliusClient] 🎯 Target: ${limit} swap transactions`);
      
      const allTransactions: HeliusEnhancedTransaction[] = [];
      let before: string | undefined;
      const perPage = 100; // Helius Enhanced API max per request
      
      while (allTransactions.length < limit) {
        const remaining = limit - allTransactions.length;
        const currentLimit = Math.min(remaining, perPage);
        
        const url = `${HELIUS_ENHANCED_API_BASE}/addresses/${poolAddress}/transactions?api-key=${HELIUS_API_KEY}`;
        
        const body: any = {
          type: ['SWAP'], // Only fetch SWAP transactions!
          limit: currentLimit,
        };
        
        if (before) {
          body.before = before;
        }
        
        console.log(`[HeliusClient] 📡 Fetching batch: ${allTransactions.length}/${limit} swaps...`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[HeliusClient] ❌ Enhanced API Response:`, errorText);
          throw new Error(`Helius Enhanced API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json() as HeliusEnhancedTransaction[];
        
        if (data.length === 0) {
          console.log(`[HeliusClient] ℹ️ No more transactions available (reached end)`);
          break;
        }
        
        allTransactions.push(...data);
        console.log(`[HeliusClient] ✅ Fetched ${data.length} swaps (Total: ${allTransactions.length}/${limit})`);
        
        // Set pagination cursor for next batch
        before = data[data.length - 1]?.signature;
        
        // If we got less than requested, we've reached the end
        if (data.length < currentLimit) {
          console.log(`[HeliusClient] ℹ️ Received less than requested (${data.length} < ${currentLimit}), reached end`);
          break;
        }
        
        // Small delay to respect rate limits (25 req/sec on Free tier)
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`[HeliusClient] ✅ Enhanced Transactions fetch complete: ${allTransactions.length} SWAP transactions`);
      return allTransactions;
      
    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Enhanced Transaction API error:`, error.message);
      throw error;
    }
  }

  /**
   * Parse Enhanced Transaction to ParsedSwap format
   * 
   * Converts Helius pre-parsed transaction data to our internal format
   */
  private parseEnhancedTransaction(
    tx: HeliusEnhancedTransaction,
    poolTokenMints?: { tokenA: string; tokenB: string }
  ): ParsedSwap | null {
    try {
      // Only process SWAP transactions
      if (tx.type !== 'SWAP') {
        return null;
      }
      
      // Find token balance changes from accountData
      let tokenAChange: number | null = null;
      let tokenBChange: number | null = null;
      let wallet: string | null = null;
      
      if (tx.accountData && poolTokenMints) {
        for (const account of tx.accountData) {
          for (const balanceChange of account.tokenBalanceChanges || []) {
            const mint = balanceChange.mint;
            const rawAmount = balanceChange.rawTokenAmount.tokenAmount;
            const decimals = balanceChange.rawTokenAmount.decimals;
            const amount = parseInt(rawAmount) / Math.pow(10, decimals);
            
            // Identify which token changed
            if (mint === poolTokenMints.tokenA) {
              tokenAChange = amount;
              wallet = account.account;
            } else if (mint === poolTokenMints.tokenB) {
              tokenBChange = amount;
              wallet = account.account;
            }
          }
        }
      }
      
      // Determine direction: BUY or SELL
      // If tokenB (usually the memecoin) increased, it's a BUY
      // If tokenB decreased, it's a SELL
      let direction: 'buy' | 'sell' = 'buy';
      let amountIn: bigint = BigInt(0);
      let amountOut: bigint = BigInt(0);
      
      if (tokenAChange !== null && tokenBChange !== null) {
        if (tokenBChange > 0) {
          // User gained tokenB (memecoin) → BUY
          direction = 'buy';
          amountIn = BigInt(Math.floor(Math.abs(tokenAChange) * 1e9));
          amountOut = BigInt(Math.floor(tokenBChange * 1e9));
        } else {
          // User lost tokenB (memecoin) → SELL
          direction = 'sell';
          amountIn = BigInt(Math.floor(Math.abs(tokenBChange) * 1e9));
          amountOut = BigInt(Math.floor(Math.abs(tokenAChange) * 1e9));
        }
      }
      
      return {
        signature: tx.signature,
        timestamp: tx.timestamp,
        wallet: wallet || tx.feePayer,
        direction,
        amountIn,
        amountOut,
      };
      
    } catch (error: any) {
      console.warn(`[HeliusClient] ⚠️ Failed to parse enhanced transaction: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze transaction history for a pool
   * 
   * NEW APPROACH: Uses Enhanced Transaction API to fetch pre-parsed SWAP transactions
   * 
   * @param poolAddress Pool address
   * @param limit Number of transactions to analyze (default: 2000)
   * @param programId Optional: DEX program ID (not used with Enhanced API)
   * @param tokenMint Optional: Token mint for Pump.fun pools
   * @returns Transaction summary with buy/sell analysis
   */
  async getTransactionHistory(
    poolAddress: string,
    limit: number = DEFAULT_TX_LIMIT,
    programId?: string,
    tokenMint?: string
  ): Promise<TransactionSummary> {
    try {
      console.log(`[HeliusClient] 🔍 Analyzing transaction history for pool: ${poolAddress}`);
      console.log(`[HeliusClient] 🎯 Target: ${limit} swap transactions`);

      // Step 1: Get pool info for token identification
      let poolTokenMints: { tokenA: string; tokenB: string } | undefined;
      try {
        const reserves = await this.getPoolReserves(poolAddress, tokenMint);
        poolTokenMints = {
          tokenA: reserves.tokenAMint,
          tokenB: reserves.tokenBMint,
        };
        console.log(`[HeliusClient] ✅ Pool tokens: ${poolTokenMints.tokenA} / ${poolTokenMints.tokenB}`);
      } catch (error: any) {
        console.warn(`[HeliusClient] ⚠️ Pool reserves not available, continuing without token context`);
      }
      
      // Step 2: Fetch SWAP transactions using Birdeye API ONLY
      let parsedSwaps: ParsedSwap[] = [];
      
      if (!this.birdeyeClient) {
        throw new Error('Birdeye client not initialized. BIRDEYE_API_KEY is required.');
      }
      
      console.log(`[HeliusClient] 🚀 Using Birdeye API for swap transactions (ONLY - no Helius fallback)`);
      parsedSwaps = await this.birdeyeClient.getSwapTransactions(poolAddress, limit, tokenMint);
      console.log(`[HeliusClient] ✅ Fetched ${parsedSwaps.length} swaps from Birdeye`);
      
      // Step 4: Analyze parsed swaps
      const analysis = analyzeTransactions(parsedSwaps);
      
      console.log(`[HeliusClient] ✅ Transaction analysis complete:`);
      console.log(`[HeliusClient]    - Total swaps: ${parsedSwaps.length}`);
      console.log(`[HeliusClient]    - Buys: ${analysis.buyCount} (${((analysis.buyCount / parsedSwaps.length) * 100).toFixed(1)}%)`);
      console.log(`[HeliusClient]    - Sells: ${analysis.sellCount} (${((analysis.sellCount / parsedSwaps.length) * 100).toFixed(1)}%)`);
      console.log(`[HeliusClient]    - Unique wallets: ${analysis.uniqueWallets || 0}`);
      
      // Step 5: PHASE 3 - Wallet Profiling (Top 5 traders only)
      if (analysis.topTraders && analysis.topTraders.length > 0) {
        console.log(`[HeliusClient] 🔍 PHASE 3: Profiling top ${Math.min(5, analysis.topTraders.length)} wallets...`);
        try {
          const { batchProfileWallets } = await import('./wallet-profiler');
          
          // Profile top 5 traders
          const topWalletsToProfile = analysis.topTraders.slice(0, 5).map(t => t.wallet);
          const poolTransactionCounts = new Map(
            analysis.topTraders.map(t => [t.wallet, t.buyCount + t.sellCount])
          );
          
          const walletProfiles = await batchProfileWallets(
            this.connection,
            topWalletsToProfile,
            poolTransactionCounts,
            analysis.totalCount
          );
          
          analysis.walletProfiles = walletProfiles;
          console.log(`[HeliusClient] ✅ Profiled ${walletProfiles.length} wallets`);
        } catch (error: any) {
          console.warn(`[HeliusClient] ⚠️ Wallet profiling failed: ${error.message}`);
          // Continue without wallet profiles
        }
      }
      
      return analysis;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to analyze transaction history:`, error.message);
      
      // Fallback: Return empty result on error
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
        summary: `Error: ${error.message}`,
      };
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
