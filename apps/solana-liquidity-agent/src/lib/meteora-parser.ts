// apps/solana-liquidity-agent/src/lib/meteora-parser.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';

/**
 * Meteora DLMM (Dynamic Liquidity Market Maker) Parser
 * 
 * Meteora DLMM uses dynamic bins for liquidity concentration
 * Similar to concentrated liquidity but with discrete price bins
 * 
 * Our approach: Extract vault addresses and fetch balances
 * This gives accurate TVL without complex bin calculations
 * 
 * DLMM LB Pair Account Structure (Simplified):
 * - Parameters: Configuration for the pair
 * - Token X/Y Mint: Token mint addresses
 * - Reserve X/Y: Token reserve vaults
 * - Active bin ID: Current price bin
 * - Bin step: Price granularity
 */

export interface ParsedMeteoraPool {
  /** Token X mint address */
  tokenXMint: string;
  /** Token Y mint address */
  tokenYMint: string;
  /** Token X reserve vault address */
  tokenXVault: string;
  /** Token Y reserve vault address */
  tokenYVault: string;
  /** Token X reserve amount (raw BigInt) */
  tokenXReserve: bigint;
  /** Token Y reserve amount (raw BigInt) */
  tokenYReserve: bigint;
  /** Token X decimals */
  tokenXDecimals: number;
  /** Token Y decimals */
  tokenYDecimals: number;
  /** Active bin ID */
  activeBinId?: number;
  /** Bin step */
  binStep?: number;
  /** Base fee rate (basis points) */
  baseFeeRate?: number;
}

/**
 * Meteora DLMM LB Pair Account Layout (Simplified)
 * Based on Meteora DLMM program structure
 */
const METEORA_DLMM_LAYOUT = {
  // Discriminator: 8 bytes
  discriminator: { offset: 0, length: 8 },
  
  // Parameters: 32 bytes (pubkey to parameters account)
  parameters: { offset: 8, length: 32 },
  
  // V Parameters: 32 bytes
  vParameters: { offset: 40, length: 32 },
  
  // Bump Seed: 1 byte
  bumpSeed: { offset: 72, length: 1 },
  
  // Bin Step: 2 bytes (u16)
  binStep: { offset: 73, length: 2 },
  
  // Pair Type: 1 byte
  pairType: { offset: 75, length: 1 },
  
  // Active ID: 4 bytes (i32)
  activeId: { offset: 76, length: 4 },
  
  // Base Fee Rate: 2 bytes (u16) - in basis points
  baseFeeRate: { offset: 80, length: 2 },
  
  // Max Fee Rate: 2 bytes (u16)
  maxFeeRate: { offset: 82, length: 2 },
  
  // Protocol Fee: 2 bytes (u16)
  protocolFee: { offset: 84, length: 2 },
  
  // Liquidity: 16 bytes (u128)
  liquidity: { offset: 86, length: 16 },
  
  // Reward Infos: Variable (we'll skip for now)
  // ...
  
  // Token X Mint: 32 bytes (at offset ~102)
  tokenXMint: { offset: 230, length: 32 },
  
  // Token Y Mint: 32 bytes
  tokenYMint: { offset: 262, length: 32 },
  
  // Reserve X: 32 bytes
  reserveX: { offset: 294, length: 32 },
  
  // Reserve Y: 32 bytes
  reserveY: { offset: 326, length: 32 },
  
  // Total size: ~358+ bytes (there's more data after this)
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
 * Helper: Read i32 from buffer (little endian)
 */
function readI32(buffer: Buffer, offset: number): number {
  return buffer.readInt32LE(offset);
}

/**
 * Parse Meteora DLMM LB Pair account data
 */
export function parseMeteoraLBPairAccount(data: Buffer): Omit<ParsedMeteoraPool, 'tokenXReserve' | 'tokenYReserve' | 'tokenXDecimals' | 'tokenYDecimals'> {
  try {
    // Verify minimum size
    if (data.length < 358) {
      throw new Error(`Meteora DLMM account data too small: ${data.length} bytes (expected >= 358)`);
    }

    // Extract pool info
    const tokenXMint = readPublicKey(data, METEORA_DLMM_LAYOUT.tokenXMint.offset);
    const tokenYMint = readPublicKey(data, METEORA_DLMM_LAYOUT.tokenYMint.offset);
    const reserveX = readPublicKey(data, METEORA_DLMM_LAYOUT.reserveX.offset);
    const reserveY = readPublicKey(data, METEORA_DLMM_LAYOUT.reserveY.offset);
    
    // Extract pool parameters
    const binStep = readU16(data, METEORA_DLMM_LAYOUT.binStep.offset);
    const activeId = readI32(data, METEORA_DLMM_LAYOUT.activeId.offset);
    const baseFeeRate = readU16(data, METEORA_DLMM_LAYOUT.baseFeeRate.offset);

    console.log('[MeteoraParser] ✅ Token X Mint:', tokenXMint.toString());
    console.log('[MeteoraParser] ✅ Token Y Mint:', tokenYMint.toString());
    console.log('[MeteoraParser] ✅ Reserve X:', reserveX.toString());
    console.log('[MeteoraParser] ✅ Reserve Y:', reserveY.toString());
    console.log('[MeteoraParser] ✅ Base Fee Rate:', baseFeeRate, 'basis points');
    console.log('[MeteoraParser] ✅ Bin Step:', binStep);
    console.log('[MeteoraParser] ✅ Active Bin ID:', activeId);

    return {
      tokenXMint: tokenXMint.toString(),
      tokenYMint: tokenYMint.toString(),
      tokenXVault: reserveX.toString(),
      tokenYVault: reserveY.toString(),
      activeBinId: activeId,
      binStep,
      baseFeeRate,
    };
  } catch (error: any) {
    console.error('[MeteoraParser] ❌ Failed to parse Meteora DLMM account:', error.message);
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
    console.error(`[MeteoraParser] ❌ Failed to get vault balance for ${vaultAddress}:`, error.message);
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
    console.error(`[MeteoraParser] ❌ Failed to get token decimals for ${mintAddress}:`, error.message);
    throw error;
  }
}

/**
 * Parse Meteora DLMM with reserves
 */
export async function parseMeteoraLBPairWithReserves(
  connection: Connection,
  poolAccountData: Buffer
): Promise<ParsedMeteoraPool> {
  console.log('[MeteoraParser] 🔍 Parsing Meteora DLMM LB Pair account...');
  
  const poolInfo = parseMeteoraLBPairAccount(poolAccountData);
  
  console.log('[MeteoraParser] 🔍 Fetching vault balances and decimals...');
  
  const [tokenXReserve, tokenYReserve, tokenXDecimals, tokenYDecimals] = await Promise.all([
    getVaultBalance(connection, poolInfo.tokenXVault),
    getVaultBalance(connection, poolInfo.tokenYVault),
    getTokenDecimals(connection, poolInfo.tokenXMint),
    getTokenDecimals(connection, poolInfo.tokenYMint),
  ]);

  console.log('[MeteoraParser] ✅ Token X reserve:', tokenXReserve.toString());
  console.log('[MeteoraParser] ✅ Token Y reserve:', tokenYReserve.toString());

  return {
    ...poolInfo,
    tokenXReserve,
    tokenYReserve,
    tokenXDecimals,
    tokenYDecimals,
  };
}

/**
 * Calculate TVL for Meteora DLMM
 */
export function calculateMeteoraTVL(
  pool: ParsedMeteoraPool,
  tokenXPriceUSD?: number,
  tokenYPriceUSD?: number
): number {
  if (!tokenXPriceUSD && !tokenYPriceUSD) {
    return 0;
  }

  const tokenXAmount = Number(pool.tokenXReserve) / (10 ** pool.tokenXDecimals);
  const tokenYAmount = Number(pool.tokenYReserve) / (10 ** pool.tokenYDecimals);

  const tokenXValue = tokenXPriceUSD ? tokenXAmount * tokenXPriceUSD : 0;
  const tokenYValue = tokenYPriceUSD ? tokenYAmount * tokenYPriceUSD : 0;

  return tokenXValue + tokenYValue;
}

/**
 * Assess Meteora DLMM health
 */
export function assessMeteoraPoolHealth(pool: ParsedMeteoraPool): {
  status: 'Healthy' | 'Warning' | 'Critical';
  issues: string[];
} {
  const issues: string[] = [];

  if (pool.tokenXReserve === 0n || pool.tokenYReserve === 0n) {
    issues.push('One or both token reserves are zero');
  }

  if (pool.baseFeeRate && (pool.baseFeeRate < 1 || pool.baseFeeRate > 10000)) {
    issues.push(`Unusual fee rate: ${pool.baseFeeRate} basis points`);
  }

  if (issues.length === 0) {
    return { status: 'Healthy', issues: [] };
  } else if (issues.length === 1) {
    return { status: 'Warning', issues };
  } else {
    return { status: 'Critical', issues };
  }
}

