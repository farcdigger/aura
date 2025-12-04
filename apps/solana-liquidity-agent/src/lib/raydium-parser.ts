// apps/solana-liquidity-agent/src/lib/raydium-parser.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4 } from '@raydium-io/raydium-sdk';
import { AccountLayout } from '@solana/spl-token';

/**
 * Raydium AMM Pool Account yapısını parse eder
 * 
 * Raydium V4 Pool Account Structure:
 * - Status (u64): Pool durumu (0=Uninitialized, 1=Initialized, 2-5=Various states, 6=Disabled)
 * - Base/Quote Mint: Token mint adresleri
 * - Base/Quote Vault: Token reserve vault'ları
 * - LP Mint: Liquidity Provider token
 * - Fee Information: Swap fee detayları
 */

export interface ParsedRaydiumPool {
  /** Base token (Token A) mint address */
  tokenAMint: string;
  /** Quote token (Token B) mint address */
  tokenBMint: string;
  /** Base token vault address (NOT the reserve amount!) */
  tokenAVault: string;
  /** Quote token vault address (NOT the reserve amount!) */
  tokenBVault: string;
  /** Base token reserve amount (raw BigInt) - fetched from vault */
  tokenAReserve: bigint;
  /** Quote token reserve amount (raw BigInt) - fetched from vault */
  tokenBReserve: bigint;
  /** Base token decimals */
  tokenADecimals: number;
  /** Quote token decimals */
  tokenBDecimals: number;
  /** LP token mint address */
  lpMint: string;
  /** LP token supply */
  lpSupply: bigint;
  /** Swap fee (in basis points, e.g., 25 = 0.25%) */
  swapFeeNumerator: bigint;
  swapFeeDenominator: bigint;
  /** Pool status (1 = active, 6 = disabled) */
  status: bigint;
  /** Pool needs take PnL values */
  needTakePnl: {
    base: bigint;
    quote: bigint;
  };
}

/**
 * Helper: Safely convert BN or number to BigInt
 */
function toBigInt(value: any): bigint {
  if (value === null || value === undefined) {
    return BigInt(0);
  }
  
  // If it's already a bigint, return it
  if (typeof value === 'bigint') {
    return value;
  }
  
  // If it's a number, convert directly
  if (typeof value === 'number') {
    return BigInt(Math.floor(value));
  }
  
  // If it has toNumber method (like BN), use it for safety
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    try {
      return BigInt(value.toNumber());
    } catch {
      // If toNumber fails (number too large), try toString
      return BigInt(value.toString());
    }
  }
  
  // If it's a string, parse it
  if (typeof value === 'string') {
    return BigInt(value);
  }
  
  // Fallback
  return BigInt(0);
}

/**
 * Parse Raydium pool account structure (Step 1: Get vault addresses)
 * @param accountData Buffer or Uint8Array containing pool account data
 * @returns Pool structure with vault addresses (reserves need separate fetch)
 */
export function parseRaydiumPoolAccount(
  accountData: Buffer | Uint8Array
): Omit<ParsedRaydiumPool, 'tokenAReserve' | 'tokenBReserve'> & {
  tokenAVault: string;
  tokenBVault: string;
} {
  try {
    // Buffer'a çevir (eğer Uint8Array ise)
    const buffer = Buffer.isBuffer(accountData) 
      ? accountData 
      : Buffer.from(accountData);

    // Minimum size check (Raydium V4 pool ~752 bytes)
    if (buffer.length < 500) {
      throw new Error(`Invalid pool account data size: ${buffer.length} bytes (expected ~752)`);
    }

    // Raydium SDK'nin layout'unu kullanarak decode et
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(buffer);

    // ✅ baseVault ve quoteVault ADRESLER, amount değil!
    const baseVaultAddress = poolState.baseVault.toString();
    const quoteVaultAddress = poolState.quoteVault.toString();

    console.log(`[RaydiumParser] ✅ Base vault: ${baseVaultAddress}`);
    console.log(`[RaydiumParser] ✅ Quote vault: ${quoteVaultAddress}`);

    // Parsed data'yı return et
    return {
      tokenAMint: poolState.baseMint.toString(),
      tokenBMint: poolState.quoteMint.toString(),
      tokenAVault: baseVaultAddress,
      tokenBVault: quoteVaultAddress,
      tokenADecimals: typeof poolState.baseDecimal === 'number' 
        ? poolState.baseDecimal 
        : poolState.baseDecimal.toNumber(),
      tokenBDecimals: typeof poolState.quoteDecimal === 'number'
        ? poolState.quoteDecimal
        : poolState.quoteDecimal.toNumber(),
      lpMint: poolState.lpMint.toString(),
      lpSupply: toBigInt(poolState.lpReserve),
      swapFeeNumerator: toBigInt(poolState.swapFeeNumerator || 25),
      swapFeeDenominator: toBigInt(poolState.swapFeeDenominator || 10000),
      status: toBigInt(poolState.status),
      needTakePnl: {
        base: toBigInt(poolState.baseNeedTakePnl),
        quote: toBigInt(poolState.quoteNeedTakePnl),
      },
    };
  } catch (error: any) {
    console.error('[RaydiumParser] ❌ Failed to parse pool account:', error.message);
    console.error('[RaydiumParser] 🐛 Error stack:', error.stack);
    throw new Error(`Failed to parse Raydium pool account: ${error.message}`);
  }
}

/**
 * Fetch vault token balances (Step 2: Get actual reserves)
 * @param connection Solana RPC connection
 * @param vaultAddress SPL token account address
 * @returns Token balance as BigInt
 */
export async function getVaultBalance(
  connection: Connection,
  vaultAddress: string
): Promise<bigint> {
  try {
    const vaultPubkey = new PublicKey(vaultAddress);
    const accountInfo = await connection.getAccountInfo(vaultPubkey);

    if (!accountInfo || !accountInfo.data) {
      throw new Error(`Vault account not found: ${vaultAddress}`);
    }

    // Parse SPL token account (165 bytes)
    const tokenAccount = AccountLayout.decode(accountInfo.data);
    const amount = tokenAccount.amount;

    // Convert u64 (8 bytes) to BigInt
    return BigInt(amount.toString());
  } catch (error: any) {
    console.error(`[RaydiumParser] ❌ Failed to fetch vault balance:`, error.message);
    throw error;
  }
}

/**
 * Parse Raydium pool WITH reserves (combines both steps)
 * @param connection Solana RPC connection
 * @param accountData Pool account data
 * @returns Complete parsed pool with reserves
 */
export async function parseRaydiumPoolWithReserves(
  connection: Connection,
  accountData: Buffer | Uint8Array
): Promise<ParsedRaydiumPool> {
  // Step 1: Parse pool structure
  const poolData = parseRaydiumPoolAccount(accountData);

  // Step 2: Fetch vault balances (reserves)
  console.log('[RaydiumParser] 🔍 Fetching vault balances...');
  const [tokenAReserve, tokenBReserve] = await Promise.all([
    getVaultBalance(connection, poolData.tokenAVault),
    getVaultBalance(connection, poolData.tokenBVault),
  ]);

  console.log(`[RaydiumParser] ✅ Token A reserve: ${tokenAReserve}`);
  console.log(`[RaydiumParser] ✅ Token B reserve: ${tokenBReserve}`);

  return {
    ...poolData,
    tokenAReserve,
    tokenBReserve,
  };
}

/**
 * Pool sağlığını değerlendir
 */
export function evaluatePoolHealth(pool: ParsedRaydiumPool): {
  isHealthy: boolean;
  issues: string[];
  warnings: string[];
  statusText: string;
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Status kontrolü
  let statusText = 'Unknown';
  const status = Number(pool.status);
  
  if (status === 0) {
    issues.push('Pool is uninitialized');
    statusText = 'Uninitialized';
  } else if (status === 1) {
    statusText = 'Active';
  } else if (status === 6) {
    issues.push('Pool is disabled by authority');
    statusText = 'Disabled';
  } else {
    statusText = `Status ${status}`;
  }

  // Likidite kontrolü (çok düşük mü?)
  const minLiquidity = BigInt(100); // Minimum 100 smallest units
  if (pool.tokenAReserve < minLiquidity) {
    issues.push(`Very low Token A reserve: ${pool.tokenAReserve}`);
  }
  if (pool.tokenBReserve < minLiquidity) {
    issues.push(`Very low Token B reserve: ${pool.tokenBReserve}`);
  }

  // LP supply kontrolü (0 ise sorun var)
  if (pool.lpSupply === BigInt(0)) {
    issues.push('Zero LP supply - pool might be drained or not initialized');
  }

  // Fee reasonableness check (>5% is suspicious)
  const feePercent = Number(pool.swapFeeNumerator) / Number(pool.swapFeeDenominator) * 100;
  if (feePercent > 5) {
    warnings.push(`High swap fee: ${feePercent.toFixed(2)}% (standard is 0.25%)`);
  }

  // Reserve imbalance warning (one side too low compared to other)
  const tokenAHumanReadable = Number(pool.tokenAReserve) / (10 ** pool.tokenADecimals);
  const tokenBHumanReadable = Number(pool.tokenBReserve) / (10 ** pool.tokenBDecimals);
  
  if (tokenAHumanReadable < 0.01 || tokenBHumanReadable < 0.01) {
    warnings.push('Pool has very low liquidity on one or both sides');
  }

  return {
    isHealthy: issues.length === 0 && status === 1,
    issues,
    warnings,
    statusText,
  };
}

/**
 * Human-readable reserve bilgisi
 */
export function formatReserves(pool: ParsedRaydiumPool): {
  tokenA: string;
  tokenB: string;
  ratio: string;
  feePercent: string;
} {
  const tokenA = Number(pool.tokenAReserve) / (10 ** pool.tokenADecimals);
  const tokenB = Number(pool.tokenBReserve) / (10 ** pool.tokenBDecimals);
  const ratio = tokenB !== 0 ? (tokenA / tokenB).toFixed(6) : 'N/A';
  const feePercent = (Number(pool.swapFeeNumerator) / Number(pool.swapFeeDenominator) * 100).toFixed(3);

  return {
    tokenA: `${tokenA.toLocaleString()} (${pool.tokenAMint.slice(0, 8)}...)`,
    tokenB: `${tokenB.toLocaleString()} (${pool.tokenBMint.slice(0, 8)}...)`,
    ratio: `${ratio}`,
    feePercent: `${feePercent}%`,
  };
}

/**
 * Calculate estimated TVL (Total Value Locked)
 * 
 * NOTE: This function now accepts optional price parameters for backwards compatibility,
 * but the main TVL calculation should use price-fetcher.ts → calculatePoolTVL()
 * 
 * @param pool Parsed Raydium pool data
 * @param tokenAPriceUSD Optional: Token A price in USD
 * @param tokenBPriceUSD Optional: Token B price in USD
 * @returns TVL in USD
 */
export function calculateTVL(
  pool: ParsedRaydiumPool,
  tokenAPriceUSD?: number,
  tokenBPriceUSD?: number
): number {
  if (!tokenAPriceUSD && !tokenBPriceUSD) {
    return 0;
  }

  const tokenAAmount = Number(pool.tokenAReserve) / (10 ** pool.tokenADecimals);
  const tokenBAmount = Number(pool.tokenBReserve) / (10 ** pool.tokenBDecimals);

  const tokenAValue = tokenAPriceUSD ? tokenAAmount * tokenAPriceUSD : 0;
  const tokenBValue = tokenBPriceUSD ? tokenBAmount * tokenBPriceUSD : 0;

  return tokenAValue + tokenBValue;
}

