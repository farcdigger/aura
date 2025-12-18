/**
 * EVM Transaction Parser
 * 
 * Parses EVM (Base/BSC) swap transactions from Birdeye API
 * Handles 18 decimal precision, hex addresses, and EVM-specific formats
 */

import type { ParsedSwap, Network } from './types';

/**
 * EVM Swap Transaction from Birdeye API
 * Based on Birdeye API documentation for EVM chains
 */
export interface EvmSwapTransaction {
  txHash: string;
  blockUnixTime: number;
  blockNumber?: number;
  source: string; // 'pancakeswap', 'aerodrome', etc.
  owner: string; // wallet address (0x...)
  txType: string; // 'swap', 'add', 'remove'
  side?: 'buy' | 'sell' | 'unknown';
  from?: {
    symbol: string;
    address: string;
    amount: string; // raw amount (string to preserve precision)
    uiAmount: number;
    decimals: number;
    price?: number;
  };
  to?: {
    symbol: string;
    address: string;
    amount: string; // raw amount (string to preserve precision)
    uiAmount: number;
    decimals: number;
    price?: number;
  };
  // Base/Quote format (alternative to from/to)
  base?: {
    symbol: string;
    address: string;
    amount: string;
  };
  quote?: {
    symbol: string;
    address: string;
    amount: string;
  };
  // Pool/Pair information
  address?: string; // pool/pair address
  poolId?: string;
  pairAddress?: string;
}

/**
 * Parse EVM swap transaction from Birdeye API to internal ParsedSwap format
 * 
 * @param transaction EVM swap transaction from Birdeye API
 * @param poolTokenAddresses Optional: Token addresses for the pool (for direction detection)
 * @param network Network (base or bsc)
 * @returns ParsedSwap or null if invalid
 */
export function parseEvmSwapTransaction(
  transaction: EvmSwapTransaction,
  poolTokenAddresses?: { tokenA: string; tokenB: string },
  network: Network = 'base'
): ParsedSwap | null {
  try {
    // Validate required fields
    if (!transaction.txHash || !transaction.owner || !transaction.blockUnixTime) {
      console.warn(`[EvmParser] ⚠️ Missing required fields in transaction:`, {
        hasTxHash: !!transaction.txHash,
        hasOwner: !!transaction.owner,
        hasBlockUnixTime: !!transaction.blockUnixTime,
      });
      return null;
    }

    // Only process swap transactions
    if (transaction.txType !== 'swap') {
      return null;
    }

    // Convert timestamp from seconds to milliseconds
    const timestamp = transaction.blockUnixTime * 1000;

    // Determine swap direction
    let direction: 'buy' | 'sell' = 'buy';
    
    // Priority 1: Use API-provided 'side' field if available
    if (transaction.side === 'buy' || transaction.side === 'sell') {
      direction = transaction.side;
    } else if (transaction.from && transaction.to && poolTokenAddresses) {
      // Priority 2: Analyze from/to based on pool token addresses
      // BUY = getting tokenA (to.address === tokenA)
      // SELL = sending tokenA (from.address === tokenA)
      const tokenA = poolTokenAddresses.tokenA.toLowerCase();
      const tokenB = poolTokenAddresses.tokenB.toLowerCase();
      
      if (transaction.to.address.toLowerCase() === tokenA) {
        direction = 'buy'; // Receiving tokenA
      } else if (transaction.from.address.toLowerCase() === tokenA) {
        direction = 'sell'; // Sending tokenA
      } else if (transaction.to.address.toLowerCase() === tokenB) {
        // If receiving tokenB, it's a sell of tokenA (relative to tokenA)
        direction = 'sell';
      } else if (transaction.from.address.toLowerCase() === tokenB) {
        // If sending tokenB, it's a buy of tokenA (relative to tokenA)
        direction = 'buy';
      }
    } else if (transaction.from && transaction.to) {
      // Priority 3: Generic detection
      // Convention: If we have from/to, check if it's a stablecoin swap
      // For Base: USDC/USDbC are common quote tokens
      // For BSC: BUSD/USDT are common quote tokens
      const stablecoins = network === 'base' 
        ? ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca'] // USDC, USDbC on Base
        : ['0xe9e7cea3dedca5984780bafc599bd69add087d56', '0x55d398326f99059ff775485246999027b3197955']; // BUSD, USDT on BSC
      
      const fromIsStable = stablecoins.some(sc => 
        transaction.from!.address.toLowerCase() === sc.toLowerCase()
      );
      const toIsStable = stablecoins.some(sc => 
        transaction.to!.address.toLowerCase() === sc.toLowerCase()
      );
      
      if (fromIsStable && !toIsStable) {
        direction = 'buy'; // Stablecoin → Token
      } else if (!fromIsStable && toIsStable) {
        direction = 'sell'; // Token → Stablecoin
      }
    }

    // Parse amounts - EVM uses 18 decimals by default
    // Use raw amount strings to preserve precision, then convert to BigInt
    let amountIn = BigInt(0);
    let amountOut = BigInt(0);
    
    if (transaction.from?.amount) {
      try {
        // Amount is already in raw format (wei/smallest unit)
        amountIn = BigInt(transaction.from.amount);
      } catch (e) {
        // Fallback: calculate from uiAmount and decimals
        const decimals = transaction.from.decimals || 18;
        const multiplier = BigInt(10) ** BigInt(decimals);
        amountIn = BigInt(Math.floor(transaction.from.uiAmount * Number(multiplier)));
      }
    }
    
    if (transaction.to?.amount) {
      try {
        amountOut = BigInt(transaction.to.amount);
      } catch (e) {
        // Fallback: calculate from uiAmount and decimals
        const decimals = transaction.to.decimals || 18;
        const multiplier = BigInt(10) ** BigInt(decimals);
        amountOut = BigInt(Math.floor(transaction.to.uiAmount * Number(multiplier)));
      }
    }

    // Calculate USD values from price data
    const amountInUsd = transaction.from?.price && transaction.from?.uiAmount 
      ? transaction.from.price * transaction.from.uiAmount 
      : undefined;
    const amountOutUsd = transaction.to?.price && transaction.to?.uiAmount 
      ? transaction.to.price * transaction.to.uiAmount 
      : undefined;

    // Calculate token price at time of transaction
    let priceToken: number | undefined = undefined;
    if (direction === 'buy' && amountOutUsd && transaction.to?.uiAmount && transaction.to.uiAmount > 0) {
      priceToken = amountOutUsd / transaction.to.uiAmount;
    } else if (direction === 'sell' && amountOutUsd && transaction.from?.uiAmount && transaction.from.uiAmount > 0) {
      priceToken = amountOutUsd / transaction.from.uiAmount;
    } else if (transaction.to?.price) {
      priceToken = transaction.to.price;
    } else if (transaction.from?.price && direction === 'sell') {
      priceToken = transaction.from.price;
    }

    // Normalize wallet address to lowercase for consistency
    const wallet = transaction.owner.toLowerCase();

    return {
      signature: transaction.txHash, // Use txHash as signature for EVM
      txHash: transaction.txHash, // EVM-specific field
      timestamp,
      blockNumber: transaction.blockNumber, // EVM block number
      wallet,
      direction,
      amountIn,
      amountOut,
      amountInUsd,
      amountOutUsd,
      priceToken,
      priceImpact: undefined, // Birdeye doesn't provide this directly
      source: transaction.source, // DEX source (e.g., 'aerodrome', 'pancakeswap')
      network, // Network information
    };

  } catch (error: any) {
    console.error(`[EvmParser] ❌ Failed to parse EVM swap:`, error.message);
    console.error(`[EvmParser] 🔍 Transaction sample:`, JSON.stringify(transaction).substring(0, 300));
    return null;
  }
}

/**
 * Parse multiple EVM swap transactions
 * 
 * @param transactions Array of EVM swap transactions
 * @param poolTokenAddresses Optional: Token addresses for direction detection
 * @param network Network (base or bsc)
 * @returns Array of ParsedSwap
 */
export function parseEvmSwapTransactions(
  transactions: EvmSwapTransaction[],
  poolTokenAddresses?: { tokenA: string; tokenB: string },
  network: Network = 'base'
): ParsedSwap[] {
  return transactions
    .map(tx => parseEvmSwapTransaction(tx, poolTokenAddresses, network))
    .filter((swap): swap is ParsedSwap => swap !== null);
}

