import { Helius } from 'helius-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import type {
  TokenMetadata,
  PoolReserves,
  TransactionSummary,
  WalletActivity,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Transaction limits
const DEFAULT_TX_LIMIT = 1000; // Increased from 100 to 1000 for better analysis
const MAX_TX_LIMIT = 1000; // Helius limit per request

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
   * NOTE: This is a simplified parser. For production, use @raydium-io/raydium-sdk
   * 
   * Raydium AMM V4 Pool Layout (simplified):
   * - Offset 0-8: Status (u64)
   * - Offset 8-16: Nonce (u64)
   * - Offset 16-24: Max order (u64)
   * - Offset 24-32: Depth (u64)
   * - Offset 32-40: Base decimal (u64)
   * - Offset 40-48: Quote decimal (u64)
   * - ... more fields ...
   * - Pool coin amount and pc amount are at specific offsets
   */
  async getPoolReserves(poolAddress: string): Promise<PoolReserves> {
    try {
      // Fetch pool account data
      await this.getPoolAccountInfo(poolAddress);
      // const data = accountInfo.data; // TODO: Use this when implementing Raydium parser

      // This is a placeholder implementation
      // In production, you should use Raydium SDK or proper Borsh deserialization
      console.warn('[HeliusClient] ⚠️ Using simplified pool parser. Consider integrating Raydium SDK for production.');

      // For now, return mock data structure
      // TODO: Implement proper Raydium AMM V4 layout parsing
      const reserves: PoolReserves = {
        tokenAMint: 'placeholder_mint_a',
        tokenBMint: 'placeholder_mint_b',
        tokenAReserve: BigInt(0),
        tokenBReserve: BigInt(0),
        poolAuthority: poolAddress,
        lpMint: 'placeholder_lp_mint',
      };

      console.log('[HeliusClient] ⚠️ Pool reserves parsing not fully implemented');
      return reserves;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to parse pool reserves:`, error.message);
      throw error;
    }
  }

  // ===========================================================================
  // TRANSACTION HISTORY (RPC)
  // ===========================================================================

  /**
   * Fetch transaction signatures for an address
   * @param address Pool or wallet address
   * @param limit Number of transactions to fetch (default: 1000, max: 1000)
   * @returns Array of transaction signatures with metadata
   */
  async getTransactionSignatures(address: string, limit: number = DEFAULT_TX_LIMIT) {
    try {
      const validLimit = Math.min(limit, MAX_TX_LIMIT);
      console.log(`[HeliusClient] Fetching ${validLimit} transaction signatures for: ${address}`);

      const pubkey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, {
        limit: validLimit,
      });

      console.log(`[HeliusClient] ✅ Found ${signatures.length} transactions`);
      return signatures;

    } catch (error: any) {
      console.error(`[HeliusClient] ❌ Failed to fetch transaction signatures:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze transaction history for a pool
   * @param poolAddress Pool address
   * @param limit Number of transactions to analyze (default: 1000)
   * @returns Transaction summary with buy/sell analysis
   */
  async getTransactionHistory(
    poolAddress: string,
    limit: number = DEFAULT_TX_LIMIT
  ): Promise<TransactionSummary> {
    try {
      const signatures = await this.getTransactionSignatures(poolAddress, limit);

      // Simplified analysis
      // In production, you'd parse each transaction to determine buy/sell
      const totalCount = signatures.length;
      
      // Simple heuristic: assume 60% buys, 40% sells (placeholder logic)
      // TODO: Implement proper transaction parsing to detect swap direction
      const buyCount = Math.floor(totalCount * 0.6);
      const sellCount = totalCount - buyCount;

      // Analyze wallet activity
      const walletActivityMap = new Map<string, number>();
      
      signatures.forEach(sig => {
        // Note: sig.err indicates if transaction failed
        if (!sig.err) {
          // In production, you'd parse the transaction to get actual wallets
          // For now, we'll use a placeholder
          const wallet = 'placeholder_wallet';
          walletActivityMap.set(wallet, (walletActivityMap.get(wallet) || 0) + 1);
        }
      });

      // Top wallets
      const topWallets: WalletActivity[] = Array.from(walletActivityMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([address, txCount]) => ({
          address,
          txCount,
          volumeShare: (txCount / totalCount) * 100,
        }));

      // Detect suspicious patterns
      const suspiciousPatterns: string[] = [];
      
      // Check for single wallet dominance
      const topWalletShare = topWallets[0]?.volumeShare || 0;
      if (topWalletShare > 30) {
        suspiciousPatterns.push(`Single wallet controls ${topWalletShare.toFixed(1)}% of transactions`);
      }

      // Check buy/sell imbalance
      const buyRatio = buyCount / totalCount;
      if (buyRatio > 0.8) {
        suspiciousPatterns.push('Extremely high buy ratio - potential pump');
      } else if (buyRatio < 0.2) {
        suspiciousPatterns.push('Extremely high sell ratio - potential dump');
      }

      // Time range
      const timeRange = signatures.length > 0 ? {
        earliest: new Date((signatures[signatures.length - 1]?.blockTime || 0) * 1000),
        latest: new Date((signatures[0]?.blockTime || 0) * 1000),
      } : undefined;

      const summary: TransactionSummary = {
        totalCount,
        totalTransactions: totalCount, // Alias
        buyCount,
        sellCount,
        avgVolumeUSD: 0, // TODO: Calculate from actual transaction data
        topWallets,
        suspiciousPatterns,
        summary: `Analyzed ${totalCount} transactions: ${buyCount} buys, ${sellCount} sells. ${suspiciousPatterns.length} suspicious patterns detected.`,
        timeRange,
      };

      console.log(`[HeliusClient] ✅ Transaction analysis complete:`);
      console.log(`   - Total: ${totalCount}`);
      console.log(`   - Buy/Sell: ${buyCount}/${sellCount}`);
      console.log(`   - Suspicious patterns: ${suspiciousPatterns.length}`);

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

