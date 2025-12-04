// apps/solana-liquidity-agent/src/lib/orca-parser.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';

/**
 * Orca Whirlpool Parser
 * 
 * Orca Whirlpool is a concentrated liquidity AMM (similar to Uniswap V3)
 * Uses tick-based liquidity with position NFTs
 * 
 * Our approach: Extract vault addresses and fetch balances directly
 * This gives accurate TVL without complex tick calculations
 * 
 * Whirlpool Account Structure (Simplified):
 * - Whirlpools Config: Configuration address
 * - Token Mint A/B: Token mint addresses
 * - Token Vault A/B: Token reserve vaults
 * - Tick spacing: Price granularity
 * - Fee rate: Swap fee in hundredths of a basis point
 */

export interface ParsedOrcaPool {
  /** Token A mint address */
  tokenAMint: string;
  /** Token B mint address */
  tokenBMint: string;
  /** Token A vault address */
  tokenAVault: string;
  /** Token B vault address */
  tokenBVault: string;
  /** Token A reserve amount (raw BigInt) */
  tokenAReserve: bigint;
  /** Token B reserve amount (raw BigInt) */
  tokenBReserve: bigint;
  /** Token A decimals */
  tokenADecimals: number;
  /** Token B decimals */
  tokenBDecimals: number;
  /** Tick spacing */
  tickSpacing?: number;
  /** Fee rate (in hundredths of basis point) */
  feeRate?: number;
  /** Current sqrt price */
  sqrtPrice?: bigint;
  /** Liquidity */
  liquidity?: bigint;
}

/**
 * Orca Whirlpool Account Layout (Simplified)
 * Based on Orca Whirlpool program structure
 */
const ORCA_WHIRLPOOL_LAYOUT = {
  // Discriminator: 8 bytes
  discriminator: { offset: 0, length: 8 },
  
  // Whirlpools Config: 32 bytes
  whirlpoolsConfig: { offset: 8, length: 32 },
  
  // Whirlpool Bump: 1 byte
  whirlpoolBump: { offset: 40, length: 1 },
  
  // Tick Spacing: 2 bytes (u16)
  tickSpacing: { offset: 41, length: 2 },
  
  // Tick Spacing Seed: 2 bytes
  tickSpacingSeed: { offset: 43, length: 2 },
  
  // Fee Rate: 2 bytes (u16) - in hundredths of basis point
  feeRate: { offset: 45, length: 2 },
  
  // Protocol Fee Rate: 2 bytes (u16)
  protocolFeeRate: { offset: 47, length: 2 },
  
  // Liquidity: 16 bytes (u128)
  liquidity: { offset: 49, length: 16 },
  
  // Sqrt Price: 16 bytes (u128)
  sqrtPrice: { offset: 65, length: 16 },
  
  // Tick Current Index: 4 bytes (i32)
  tickCurrentIndex: { offset: 81, length: 4 },
  
  // Protocol Fee Owed A: 8 bytes (u64)
  protocolFeeOwedA: { offset: 85, length: 8 },
  
  // Protocol Fee Owed B: 8 bytes (u64)
  protocolFeeOwedB: { offset: 93, length: 8 },
  
  // Token Mint A: 32 bytes
  tokenMintA: { offset: 101, length: 32 },
  
  // Token Vault A: 32 bytes
  tokenVaultA: { offset: 133, length: 32 },
  
  // Fee Growth Global A: 16 bytes (u128)
  feeGrowthGlobalA: { offset: 165, length: 16 },
  
  // Token Mint B: 32 bytes
  tokenMintB: { offset: 181, length: 32 },
  
  // Token Vault B: 32 bytes
  tokenVaultB: { offset: 213, length: 32 },
  
  // Fee Growth Global B: 16 bytes (u128)
  feeGrowthGlobalB: { offset: 245, length: 16 },
  
  // Total size: ~261+ bytes (there's more data after this)
};

/**
 * Helper: Read PublicKey from buffer
 */
function readPublicKey(buffer: Buffer, offset: number): PublicKey {
  const bytes = buffer.subarray(offset, offset + 32);
  return new PublicKey(bytes);
}

/**
 * Helper: Read u16 from buffer (little endian)
 */
function readU16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

/**
 * Helper: Read u128 as BigInt from buffer (little endian)
 */
function readU128(buffer: Buffer, offset: number): bigint {
  const low = buffer.readBigUInt64LE(offset);
  const high = buffer.readBigUInt64LE(offset + 8);
  return (high << 64n) | low;
}

/**
 * Parse Orca Whirlpool account data
 */
export function parseOrcaWhirlpoolAccount(data: Buffer): Omit<ParsedOrcaPool, 'tokenAReserve' | 'tokenBReserve' | 'tokenADecimals' | 'tokenBDecimals'> {
  try {
    // Verify minimum size
    if (data.length < 261) {
      throw new Error(`Orca Whirlpool account data too small: ${data.length} bytes (expected >= 261)`);
    }

    // Extract pool info
    const tokenMintA = readPublicKey(data, ORCA_WHIRLPOOL_LAYOUT.tokenMintA.offset);
    const tokenMintB = readPublicKey(data, ORCA_WHIRLPOOL_LAYOUT.tokenMintB.offset);
    const tokenVaultA = readPublicKey(data, ORCA_WHIRLPOOL_LAYOUT.tokenVaultA.offset);
    const tokenVaultB = readPublicKey(data, ORCA_WHIRLPOOL_LAYOUT.tokenVaultB.offset);
    
    // Extract pool parameters
    const tickSpacing = readU16(data, ORCA_WHIRLPOOL_LAYOUT.tickSpacing.offset);
    const feeRate = readU16(data, ORCA_WHIRLPOOL_LAYOUT.feeRate.offset);
    const liquidity = readU128(data, ORCA_WHIRLPOOL_LAYOUT.liquidity.offset);
    const sqrtPrice = readU128(data, ORCA_WHIRLPOOL_LAYOUT.sqrtPrice.offset);

    console.log('[OrcaParser] ✅ Token A Mint:', tokenMintA.toString());
    console.log('[OrcaParser] ✅ Token B Mint:', tokenMintB.toString());
    console.log('[OrcaParser] ✅ Token A Vault:', tokenVaultA.toString());
    console.log('[OrcaParser] ✅ Token B Vault:', tokenVaultB.toString());
    console.log('[OrcaParser] ✅ Fee Rate:', feeRate, 'hundredths of basis point');
    console.log('[OrcaParser] ✅ Tick Spacing:', tickSpacing);

    return {
      tokenAMint: tokenMintA.toString(),
      tokenBMint: tokenMintB.toString(),
      tokenAVault: tokenVaultA.toString(),
      tokenBVault: tokenVaultB.toString(),
      tickSpacing,
      feeRate,
      sqrtPrice,
      liquidity,
    };
  } catch (error: any) {
    console.error('[OrcaParser] ❌ Failed to parse Orca Whirlpool account:', error.message);
    throw error;
  }
}

/**
 * Get vault balance for a token account
 */
async function getVaultBalance(
  connection: Connection,
  vaultAddress: string
): Promise<bigint> {
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(vaultAddress));
    
    if (!accountInfo) {
      throw new Error(`Vault account not found: ${vaultAddress}`);
    }

    const tokenAccount = AccountLayout.decode(accountInfo.data);
    const balance = tokenAccount.amount;

    return typeof balance === 'bigint' ? balance : BigInt(balance.toString());
  } catch (error: any) {
    console.error(`[OrcaParser] ❌ Failed to get vault balance for ${vaultAddress}:`, error.message);
    throw error;
  }
}

/**
 * Get token decimals from mint account
 */
async function getTokenDecimals(
  connection: Connection,
  mintAddress: string
): Promise<number> {
  try {
    const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
    
    if (!mintInfo.value) {
      throw new Error(`Mint account not found: ${mintAddress}`);
    }

    const data = mintInfo.value.data;
    if ('parsed' in data && data.parsed.type === 'mint') {
      return data.parsed.info.decimals;
    }

    throw new Error(`Failed to parse mint decimals for: ${mintAddress}`);
  } catch (error: any) {
    console.error(`[OrcaParser] ❌ Failed to get token decimals for ${mintAddress}:`, error.message);
    throw error;
  }
}

/**
 * Parse Orca Whirlpool with reserves
 */
export async function parseOrcaWhirlpoolWithReserves(
  connection: Connection,
  poolAccountData: Buffer
): Promise<ParsedOrcaPool> {
  console.log('[OrcaParser] 🔍 Parsing Orca Whirlpool account...');
  
  const poolInfo = parseOrcaWhirlpoolAccount(poolAccountData);
  
  console.log('[OrcaParser] 🔍 Fetching vault balances and decimals...');
  
  const [tokenAReserve, tokenBReserve, tokenADecimals, tokenBDecimals] = await Promise.all([
    getVaultBalance(connection, poolInfo.tokenAVault),
    getVaultBalance(connection, poolInfo.tokenBVault),
    getTokenDecimals(connection, poolInfo.tokenAMint),
    getTokenDecimals(connection, poolInfo.tokenBMint),
  ]);

  console.log('[OrcaParser] ✅ Token A reserve:', tokenAReserve.toString());
  console.log('[OrcaParser] ✅ Token B reserve:', tokenBReserve.toString());

  return {
    ...poolInfo,
    tokenAReserve,
    tokenBReserve,
    tokenADecimals,
    tokenBDecimals,
  };
}

/**
 * Calculate TVL for Orca Whirlpool
 */
export function calculateOrcaTVL(
  pool: ParsedOrcaPool,
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

/**
 * Assess Orca Whirlpool health
 */
export function assessOrcaPoolHealth(pool: ParsedOrcaPool): {
  status: 'Healthy' | 'Warning' | 'Critical';
  issues: string[];
} {
  const issues: string[] = [];

  if (pool.tokenAReserve === 0n || pool.tokenBReserve === 0n) {
    issues.push('One or both token reserves are zero');
  }

  if (pool.liquidity && pool.liquidity === 0n) {
    issues.push('Pool liquidity is zero');
  }

  if (pool.feeRate && (pool.feeRate < 1 || pool.feeRate > 10000)) {
    issues.push(`Unusual fee rate: ${pool.feeRate}`);
  }

  if (issues.length === 0) {
    return { status: 'Healthy', issues: [] };
  } else if (issues.length === 1) {
    return { status: 'Warning', issues };
  } else {
    return { status: 'Critical', issues };
  }
}

