// apps/solana-liquidity-agent/src/lib/clmm-parser.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';

/**
 * Raydium CLMM (Concentrated Liquidity Market Maker) Pool Parser
 * 
 * CLMM pools use tick-based liquidity which is complex to parse fully.
 * Our approach: Extract vault addresses and fetch balances directly.
 * This gives us accurate TVL without complex tick calculations.
 * 
 * CLMM Pool Account Structure (Simplified):
 * - Config ID: CLMM config address
 * - Token Mint A/B: Token mint addresses
 * - Token Vault A/B: Token reserve vaults
 * - Observation: Price oracle data
 * - Various tick and position data
 */

export interface ParsedCLMMPool {
  /** Token A mint address */
  tokenAMint: string;
  /** Token B mint address */
  tokenBMint: string;
  /** Token A vault address */
  tokenAVault: string;
  /** Token B vault address */
  tokenBVault: string;
  /** Token A reserve amount (raw BigInt) - fetched from vault */
  tokenAReserve: bigint;
  /** Token B reserve amount (raw BigInt) - fetched from vault */
  tokenBReserve: bigint;
  /** Token A decimals */
  tokenADecimals: number;
  /** Token B decimals */
  tokenBDecimals: number;
  /** Current tick index (price indicator) */
  tickCurrent?: number;
  /** Sqrt price (X64 format) */
  sqrtPriceX64?: bigint;
  /** Liquidity */
  liquidity?: bigint;
  /** Fee rate (basis points) */
  feeRate?: number;
  /** Protocol fee rate */
  protocolFeeRate?: number;
}

/**
 * CLMM Pool Account Layout (Simplified)
 * We only extract the fields we need for TVL calculation
 */
const CLMM_POOL_LAYOUT = {
  // Discriminator: 8 bytes (identifies account type)
  discriminator: { offset: 0, length: 8 },
  
  // Config: 32 bytes (CLMM config address)
  config: { offset: 8, length: 32 },
  
  // Token Mint A: 32 bytes
  tokenMintA: { offset: 40, length: 32 },
  
  // Token Mint B: 32 bytes
  tokenMintB: { offset: 72, length: 32 },
  
  // Token Vault A: 32 bytes
  tokenVaultA: { offset: 104, length: 32 },
  
  // Token Vault B: 32 bytes
  tokenVaultB: { offset: 136, length: 32 },
  
  // Observation Index: 2 bytes (u16)
  observationIndex: { offset: 168, length: 2 },
  
  // Fee rate: 4 bytes (u32) - in basis points (e.g., 2500 = 0.25%)
  feeRate: { offset: 170, length: 4 },
  
  // Protocol fee rate: 4 bytes (u32)
  protocolFeeRate: { offset: 174, length: 4 },
  
  // Liquidity: 16 bytes (u128)
  liquidity: { offset: 178, length: 16 },
  
  // Sqrt Price X64: 16 bytes (u128)
  sqrtPriceX64: { offset: 194, length: 16 },
  
  // Tick current: 4 bytes (i32)
  tickCurrent: { offset: 210, length: 4 },
  
  // Note: There's more data after this (tick arrays, bitmap, etc.)
  // but we don't need it for basic TVL calculation
};

/**
 * Helper: Read PublicKey from buffer
 */
function readPublicKey(buffer: Buffer, offset: number): PublicKey {
  const bytes = buffer.subarray(offset, offset + 32);
  return new PublicKey(bytes);
}

/**
 * Helper: Read u32 from buffer (little endian)
 */
function readU32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

/**
 * Helper: Read i32 from buffer (little endian)
 */
function readI32(buffer: Buffer, offset: number): number {
  return buffer.readInt32LE(offset);
}

/**
 * Helper: Read u128 as BigInt from buffer (little endian)
 */
function readU128(buffer: Buffer, offset: number): bigint {
  // Read as two 64-bit values and combine
  const low = buffer.readBigUInt64LE(offset);
  const high = buffer.readBigUInt64LE(offset + 8);
  return (high << 64n) | low;
}

/**
 * Parse Raydium CLMM pool account data
 */
export function parseCLMMPoolAccount(data: Buffer): Omit<ParsedCLMMPool, 'tokenAReserve' | 'tokenBReserve' | 'tokenADecimals' | 'tokenBDecimals'> {
  try {
    // Verify minimum size
    if (data.length < 214) {
      throw new Error(`CLMM pool account data too small: ${data.length} bytes (expected >= 214)`);
    }

    // Extract basic pool info
    const tokenMintA = readPublicKey(data, CLMM_POOL_LAYOUT.tokenMintA.offset);
    const tokenMintB = readPublicKey(data, CLMM_POOL_LAYOUT.tokenMintB.offset);
    const tokenVaultA = readPublicKey(data, CLMM_POOL_LAYOUT.tokenVaultA.offset);
    const tokenVaultB = readPublicKey(data, CLMM_POOL_LAYOUT.tokenVaultB.offset);
    
    // Extract pool parameters
    const feeRate = readU32(data, CLMM_POOL_LAYOUT.feeRate.offset);
    const protocolFeeRate = readU32(data, CLMM_POOL_LAYOUT.protocolFeeRate.offset);
    const liquidity = readU128(data, CLMM_POOL_LAYOUT.liquidity.offset);
    const sqrtPriceX64 = readU128(data, CLMM_POOL_LAYOUT.sqrtPriceX64.offset);
    const tickCurrent = readI32(data, CLMM_POOL_LAYOUT.tickCurrent.offset);

    console.log('[CLMMParser] ✅ Token A Mint:', tokenMintA.toString());
    console.log('[CLMMParser] ✅ Token B Mint:', tokenMintB.toString());
    console.log('[CLMMParser] ✅ Token A Vault:', tokenVaultA.toString());
    console.log('[CLMMParser] ✅ Token B Vault:', tokenVaultB.toString());
    console.log('[CLMMParser] ✅ Fee Rate:', feeRate, 'basis points');
    console.log('[CLMMParser] ✅ Current Tick:', tickCurrent);

    return {
      tokenAMint: tokenMintA.toString(),
      tokenBMint: tokenMintB.toString(),
      tokenAVault: tokenVaultA.toString(),
      tokenBVault: tokenVaultB.toString(),
      tickCurrent,
      sqrtPriceX64,
      liquidity,
      feeRate,
      protocolFeeRate,
    };
  } catch (error: any) {
    console.error('[CLMMParser] ❌ Failed to parse CLMM pool account:', error.message);
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

    // Parse SPL token account
    const tokenAccount = AccountLayout.decode(accountInfo.data);
    const balance = tokenAccount.amount;

    return typeof balance === 'bigint' ? balance : BigInt(balance.toString());
  } catch (error: any) {
    console.error(`[CLMMParser] ❌ Failed to get vault balance for ${vaultAddress}:`, error.message);
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
    console.error(`[CLMMParser] ❌ Failed to get token decimals for ${mintAddress}:`, error.message);
    throw error;
  }
}

/**
 * Parse CLMM pool with reserves
 * This is the main function to use - it fetches vault balances and decimals
 */
export async function parseCLMMPoolWithReserves(
  connection: Connection,
  poolAccountData: Buffer
): Promise<ParsedCLMMPool> {
  console.log('[CLMMParser] 🔍 Parsing CLMM pool account...');
  
  // Parse pool account
  const poolInfo = parseCLMMPoolAccount(poolAccountData);
  
  console.log('[CLMMParser] 🔍 Fetching vault balances and decimals...');
  
  // Fetch vault balances and token decimals in parallel
  const [tokenAReserve, tokenBReserve, tokenADecimals, tokenBDecimals] = await Promise.all([
    getVaultBalance(connection, poolInfo.tokenAVault),
    getVaultBalance(connection, poolInfo.tokenBVault),
    getTokenDecimals(connection, poolInfo.tokenAMint),
    getTokenDecimals(connection, poolInfo.tokenBMint),
  ]);

  console.log('[CLMMParser] ✅ Token A reserve:', tokenAReserve.toString());
  console.log('[CLMMParser] ✅ Token B reserve:', tokenBReserve.toString());
  console.log('[CLMMParser] ✅ Token A decimals:', tokenADecimals);
  console.log('[CLMMParser] ✅ Token B decimals:', tokenBDecimals);

  return {
    ...poolInfo,
    tokenAReserve,
    tokenBReserve,
    tokenADecimals,
    tokenBDecimals,
  };
}

/**
 * Calculate TVL for a CLMM pool
 */
export function calculateCLMMTVL(
  pool: ParsedCLMMPool,
  tokenAPriceUSD?: number,
  tokenBPriceUSD?: number
): number {
  if (!tokenAPriceUSD && !tokenBPriceUSD) {
    return 0;
  }

  // Convert reserves to human-readable amounts
  const tokenAAmount = Number(pool.tokenAReserve) / (10 ** pool.tokenADecimals);
  const tokenBAmount = Number(pool.tokenBReserve) / (10 ** pool.tokenBDecimals);

  // Calculate USD values
  const tokenAValue = tokenAPriceUSD ? tokenAAmount * tokenAPriceUSD : 0;
  const tokenBValue = tokenBPriceUSD ? tokenBAmount * tokenBPriceUSD : 0;

  return tokenAValue + tokenBValue;
}

/**
 * Assess CLMM pool health
 */
export function assessCLMMPoolHealth(pool: ParsedCLMMPool): {
  status: 'Healthy' | 'Warning' | 'Critical';
  issues: string[];
} {
  const issues: string[] = [];

  // Check 1: Reserves should be non-zero
  if (pool.tokenAReserve === 0n || pool.tokenBReserve === 0n) {
    issues.push('One or both token reserves are zero');
  }

  // Check 2: Liquidity should be non-zero
  if (pool.liquidity && pool.liquidity === 0n) {
    issues.push('Pool liquidity is zero');
  }

  // Check 3: Fee rate sanity check (should be reasonable)
  if (pool.feeRate && (pool.feeRate < 1 || pool.feeRate > 10000)) {
    issues.push(`Unusual fee rate: ${pool.feeRate} basis points`);
  }

  // Determine overall status
  if (issues.length === 0) {
    return { status: 'Healthy', issues: [] };
  } else if (issues.length === 1) {
    return { status: 'Warning', issues };
  } else {
    return { status: 'Critical', issues };
  }
}

