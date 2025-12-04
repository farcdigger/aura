// apps/solana-liquidity-agent/src/lib/pool-detector.ts

import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Pool Type Detector
 * 
 * Automatically detects whether a given pool address is:
 * - Raydium AMM V4
 * - Raydium CLMM
 * - Unknown/Unsupported
 * 
 * Detection strategy:
 * 1. Fetch account data
 * 2. Check account size (V4 = 752 bytes, CLMM = variable but usually larger)
 * 3. Check discriminator (first 8 bytes)
 * 4. Validate structure
 */

export enum PoolType {
  RAYDIUM_AMM_V4 = 'RAYDIUM_AMM_V4',
  RAYDIUM_CLMM = 'RAYDIUM_CLMM',
  ORCA_WHIRLPOOL = 'ORCA_WHIRLPOOL',
  METEORA_DLMM = 'METEORA_DLMM',
  PUMPFUN_BONDING_CURVE = 'PUMPFUN_BONDING_CURVE',
  UNKNOWN = 'UNKNOWN',
}

export interface PoolDetectionResult {
  type: PoolType;
  accountSize: number;
  discriminator?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Known sizes and discriminators for different pool types
 */
const KNOWN_POOL_SIGNATURES = {
  // Raydium AMM V4: Exact size match
  RAYDIUM_AMM_V4_SIZE: 752,
  
  // Raydium CLMM: Size range
  RAYDIUM_CLMM_MIN_SIZE: 800,
  RAYDIUM_CLMM_MAX_SIZE: 1200,
  
  // Orca Whirlpool: Size range (actual size is 653 bytes)
  ORCA_WHIRLPOOL_SIZE: 653,
  
  // Meteora DLMM: Size range
  METEORA_DLMM_MIN_SIZE: 358,
  METEORA_DLMM_MAX_SIZE: 600,
  
  // Pump.fun Bonding Curve: Size range
  PUMPFUN_MIN_SIZE: 280,
  PUMPFUN_MAX_SIZE: 320,
  PUMPFUN_DISCRIMINATOR: 'f19a6d0411b16dbc',
};

/**
 * Detect pool type from account data
 */
export async function detectPoolType(
  connection: Connection,
  poolAddress: string
): Promise<PoolDetectionResult> {
  try {
    console.log(`[PoolDetector] 🔍 Detecting pool type for: ${poolAddress}`);
    
    // Fetch account data
    const accountInfo = await connection.getAccountInfo(new PublicKey(poolAddress));
    
    if (!accountInfo) {
      return {
        type: PoolType.UNKNOWN,
        accountSize: 0,
        confidence: 'high',
        reason: 'Pool account not found',
      };
    }

    const accountSize = accountInfo.data.length;
    const discriminator = accountInfo.data.subarray(0, 8).toString('hex');

    console.log(`[PoolDetector] 📊 Account size: ${accountSize} bytes`);
    console.log(`[PoolDetector] 🔑 Discriminator: ${discriminator}`);

    // Detection logic - Order matters! Check from most specific to least specific
    
    // Check 1: Pump.fun Bonding Curve (discriminator is most reliable)
    if (discriminator === KNOWN_POOL_SIGNATURES.PUMPFUN_DISCRIMINATOR) {
      console.log('[PoolDetector] ✅ Detected: Pump.fun Bonding Curve (discriminator match)');
      return {
        type: PoolType.PUMPFUN_BONDING_CURVE,
        accountSize,
        discriminator,
        confidence: 'high',
        reason: 'Pump.fun bonding curve discriminator match',
      };
    }
    
    // Check 2: Exact size match for Raydium AMM V4 (most reliable)
    if (accountSize === KNOWN_POOL_SIGNATURES.RAYDIUM_AMM_V4_SIZE) {
      console.log('[PoolDetector] ✅ Detected: Raydium AMM V4 (exact size match)');
      return {
        type: PoolType.RAYDIUM_AMM_V4,
        accountSize,
        discriminator,
        confidence: 'high',
        reason: 'Exact size match for Raydium AMM V4 (752 bytes)',
      };
    }

    // Check 3: Orca Whirlpool exact size + discriminator
    if (accountSize === KNOWN_POOL_SIGNATURES.ORCA_WHIRLPOOL_SIZE) {
      // Known Orca discriminator: 3f95d10ce1806309
      if (discriminator === '3f95d10ce1806309') {
        console.log('[PoolDetector] ✅ Detected: Orca Whirlpool (size + discriminator match)');
        return {
          type: PoolType.ORCA_WHIRLPOOL,
          accountSize,
          discriminator,
          confidence: 'high',
          reason: 'Orca Whirlpool discriminator and size match (653 bytes)',
        };
      }
    }

    // Check 4: Meteora DLMM size range
    if (accountSize >= KNOWN_POOL_SIGNATURES.METEORA_DLMM_MIN_SIZE && 
        accountSize <= KNOWN_POOL_SIGNATURES.METEORA_DLMM_MAX_SIZE) {
      const isValidMeteora = await validateMeteoraLBPairStructure(accountInfo.data);
      
      if (isValidMeteora) {
        console.log('[PoolDetector] ✅ Detected: Meteora DLMM (structure validation passed)');
        return {
          type: PoolType.METEORA_DLMM,
          accountSize,
          discriminator,
          confidence: 'high',
          reason: 'Valid Meteora DLMM structure detected',
        };
      }
    }

    // Check 5: Raydium CLMM size range
    if (accountSize >= KNOWN_POOL_SIGNATURES.RAYDIUM_CLMM_MIN_SIZE && 
        accountSize <= KNOWN_POOL_SIGNATURES.RAYDIUM_CLMM_MAX_SIZE) {
      const isValidCLMM = await validateCLMMStructure(accountInfo.data);
      
      if (isValidCLMM) {
        console.log('[PoolDetector] ✅ Detected: Raydium CLMM (structure validation passed)');
        return {
          type: PoolType.RAYDIUM_CLMM,
          accountSize,
          discriminator,
          confidence: 'high',
          reason: 'Valid CLMM structure detected',
        };
      }
    }

    // Check 6: Very close to V4 size (might be V4 with slight variations)
    // Only accept if VERY close to 752 (within 10 bytes)
    if (accountSize >= 742 && accountSize <= 751) {
      console.log('[PoolDetector] ⚠️ Account size very close to V4 (within 10 bytes)');
      return {
        type: PoolType.RAYDIUM_AMM_V4,
        accountSize,
        discriminator,
        confidence: 'medium',
        reason: 'Size very close to V4 (742-751 bytes)',
      };
    }

    // Default: Unknown
    console.log('[PoolDetector] ❌ Unknown pool type');
    return {
      type: PoolType.UNKNOWN,
      accountSize,
      discriminator,
      confidence: 'low',
      reason: `Unrecognized account structure (size: ${accountSize} bytes)`,
    };

  } catch (error: any) {
    console.error('[PoolDetector] ❌ Error detecting pool type:', error.message);
    return {
      type: PoolType.UNKNOWN,
      accountSize: 0,
      confidence: 'low',
      reason: `Detection error: ${error.message}`,
    };
  }
}

/**
 * Validate if account data has valid CLMM structure
 */
async function validateCLMMStructure(data: Buffer): Promise<boolean> {
  try {
    if (data.length < 214) return false;

    const tokenMintA = data.subarray(40, 72);
    const tokenMintB = data.subarray(72, 104);
    const vaultA = data.subarray(104, 136);
    const vaultB = data.subarray(136, 168);
    
    if (tokenMintA.every(byte => byte === 0) || tokenMintB.every(byte => byte === 0)) return false;
    if (vaultA.every(byte => byte === 0) || vaultB.every(byte => byte === 0)) return false;

    const feeRate = data.readUInt32LE(170);
    if (feeRate < 1 || feeRate > 10000) return false;

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validate if account data has valid Orca Whirlpool structure
 */
async function validateOrcaWhirlpoolStructure(data: Buffer): Promise<boolean> {
  try {
    if (data.length < 261) return false;

    // Check token mints (at offsets 101 and 181)
    const tokenMintA = data.subarray(101, 133);
    const tokenMintB = data.subarray(181, 213);
    
    if (tokenMintA.every(byte => byte === 0) || tokenMintB.every(byte => byte === 0)) return false;

    // Check vaults (at offsets 133 and 213)
    const vaultA = data.subarray(133, 165);
    const vaultB = data.subarray(213, 245);
    
    if (vaultA.every(byte => byte === 0) || vaultB.every(byte => byte === 0)) return false;

    // Check fee rate (at offset 45, u16, in hundredths of basis point)
    const feeRate = data.readUInt16LE(45);
    if (feeRate < 1 || feeRate > 100000) return false; // 0.01% to 1000%

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validate if account data has valid Meteora DLMM structure
 */
async function validateMeteoraLBPairStructure(data: Buffer): Promise<boolean> {
  try {
    if (data.length < 358) return false;

    // Check token mints (at offsets 230 and 262)
    const tokenXMint = data.subarray(230, 262);
    const tokenYMint = data.subarray(262, 294);
    
    if (tokenXMint.every(byte => byte === 0) || tokenYMint.every(byte => byte === 0)) return false;

    // Check reserves (at offsets 294 and 326)
    const reserveX = data.subarray(294, 326);
    const reserveY = data.subarray(326, 358);
    
    if (reserveX.every(byte => byte === 0) || reserveY.every(byte => byte === 0)) return false;

    // Check fee rate (at offset 80, u16, in basis points)
    const baseFeeRate = data.readUInt16LE(80);
    if (baseFeeRate < 1 || baseFeeRate > 10000) return false;

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Quick check if a pool is AMM V4 (by size only)
 */
export function isLikelyAMMV4(accountSize: number): boolean {
  return accountSize === KNOWN_DISCRIMINATORS.RAYDIUM_AMM_V4_SIZE;
}

/**
 * Quick check if a pool is likely CLMM (by size only)
 */
export function isLikelyCLMM(accountSize: number): boolean {
  return accountSize >= KNOWN_DISCRIMINATORS.CLMM_MIN_SIZE;
}

/**
 * Get human-readable pool type name
 */
export function getPoolTypeName(type: PoolType): string {
  switch (type) {
    case PoolType.RAYDIUM_AMM_V4:
      return 'Raydium AMM V4';
    case PoolType.RAYDIUM_CLMM:
      return 'Raydium CLMM';
    case PoolType.ORCA_WHIRLPOOL:
      return 'Orca Whirlpool';
    case PoolType.METEORA_DLMM:
      return 'Meteora DLMM';
    case PoolType.PUMPFUN_BONDING_CURVE:
      return 'Pump.fun Bonding Curve';
    case PoolType.UNKNOWN:
      return 'Unknown/Unsupported';
    default:
      return 'Unknown';
  }
}

