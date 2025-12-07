/**
 * Pump.fun Bonding Curve Parser
 * 
 * Pump.fun is a popular Solana memecoin launchpad that uses bonding curve mechanics.
 * Tokens are bought/sold via a bonding curve until a market cap threshold is reached,
 * then they are automatically migrated to Raydium.
 * 
 * Program ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 * Account Size: ~300-320 bytes (bonding curve state)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { AdjustedPoolReserves } from './types';

/**
 * Pump.fun Program ID
 */
export const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/**
 * Known discriminator for pump.fun bonding curve
 */
export const PUMPFUN_BONDING_CURVE_DISCRIMINATOR = 'f19a6d0411b16dbc';

/**
 * Parsed Pump.fun Bonding Curve Data
 */
export interface ParsedPumpfunBondingCurve {
  /** Token mint address */
  tokenMint: string;
  /** SOL mint (native wrapped SOL) */
  solMint: string;
  /** Token A mint (SOL) - for compatibility with helius-client */
  tokenAMint: string;
  /** Token B mint (token) - for compatibility with helius-client */
  tokenBMint: string;
  /** Virtual SOL reserves (bonding curve) */
  virtualSolReserves: bigint;
  /** Virtual token reserves (bonding curve) */
  virtualTokenReserves: bigint;
  /** Real SOL reserves */
  realSolReserves: bigint;
  /** Real token reserves */
  realTokenReserves: bigint;
  /** Token decimals */
  tokenDecimals: number;
  /** Token A decimals (SOL = 9) */
  tokenADecimals: number;
  /** Token B decimals (token) */
  tokenBDecimals: number;
  /** Bonding curve complete (migrated to Raydium?) */
  complete: boolean;
}

/**
 * Parse Pump.fun bonding curve account data
 * 
 * Account Layout (estimated based on 301 bytes):
 * - 0-8: Discriminator
 * - 8-40: Token mint (32 bytes) - UNVERIFIED, may be authority/creator
 * - 40-72: Bonding curve authority (32 bytes)
 * - 72-80: Virtual SOL reserves (8 bytes)
 * - 80-88: Virtual token reserves (8 bytes)
 * - 88-96: Real SOL reserves (8 bytes)
 * - 96-104: Real token reserves (8 bytes)
 * - 104-112: Token total supply (8 bytes)
 * - 112: Complete flag (1 byte)
 * - Rest: Metadata and padding
 * 
 * NOTE: Token mint address is NOT reliably stored in account data!
 * It should be provided externally (from DexScreener, Jupiter, or user input).
 */
export function parsePumpfunBondingCurve(accountData: Buffer, tokenMintOverride?: string): ParsedPumpfunBondingCurve {
  try {
    console.log(`[PumpfunParser] 🔍 Parsing Pump.fun bonding curve...`);
    console.log(`[PumpfunParser] Account size: ${accountData.length} bytes`);
    
    // Read discriminator (first 8 bytes)
    const discriminator = accountData.slice(0, 8).toString('hex');
    console.log(`[PumpfunParser] Discriminator: ${discriminator}`);
    
    // 🔍 DEBUG: Hex dump to find correct offsets
    console.log(`[PumpfunParser] 🔍 HEX DUMP (first 150 bytes):`);
    console.log(accountData.slice(0, 150).toString('hex'));
    
    // Try multiple potential offsets for token mint
    const possibleMints: Array<{offset: number; address: string}> = [];
    
    // Check offsets: 8, 40, 72, 104, 136, 168, 200, 232, 264
    for (let offset = 8; offset < accountData.length - 32; offset += 32) {
      try {
        const mintBytes = accountData.slice(offset, offset + 32);
        const mint = new PublicKey(mintBytes).toString();
        possibleMints.push({ offset, address: mint });
      } catch (e) {
        // Invalid pubkey, skip
      }
    }
    
    console.log(`[PumpfunParser] 🔍 Possible token mints found at different offsets:`);
    possibleMints.forEach(({ offset, address }) => {
      console.log(`[PumpfunParser]    Offset ${offset}: ${address}`);
    });
    
    // Read token mint - use override if provided, otherwise try offset 8
    let tokenMint: string;
    if (tokenMintOverride) {
      tokenMint = tokenMintOverride;
      console.log(`[PumpfunParser] ✅ Using provided token mint (from DexScreener/Jupiter): ${tokenMint}`);
    } else {
      const tokenMintBytes = accountData.slice(8, 40);
      tokenMint = new PublicKey(tokenMintBytes).toString();
      console.log(`[PumpfunParser] ⚠️ Using offset 8 (UNVERIFIED, may be wrong!): ${tokenMint}`);
    }
    
    // SOL mint (native wrapped SOL)
    const solMint = 'So11111111111111111111111111111111111111112';
    
    // Try to read reserves (offsets are estimated, may need adjustment)
    let virtualSolReserves: bigint;
    let virtualTokenReserves: bigint;
    let realSolReserves: bigint;
    let realTokenReserves: bigint;
    let complete: boolean;
    
    try {
      // Virtual reserves (used for pricing calculation)
      virtualSolReserves = accountData.readBigUInt64LE(72);
      virtualTokenReserves = accountData.readBigUInt64LE(80);
      
      // Real reserves (actual liquidity)
      realSolReserves = accountData.readBigUInt64LE(88);
      realTokenReserves = accountData.readBigUInt64LE(96);
      
      // Complete flag (migrated to Raydium?)
      complete = accountData.readUInt8(112) === 1;
      
      console.log(`[PumpfunParser] ✅ Virtual SOL: ${virtualSolReserves}`);
      console.log(`[PumpfunParser] ✅ Virtual Token: ${virtualTokenReserves}`);
      console.log(`[PumpfunParser] ✅ Real SOL: ${realSolReserves}`);
      console.log(`[PumpfunParser] ✅ Real Token: ${realTokenReserves}`);
      console.log(`[PumpfunParser] ✅ Complete: ${complete}`);
      
    } catch (error) {
      console.warn(`[PumpfunParser] ⚠️ Failed to read reserves, using fallback values`);
      // Fallback: Use zeros if parsing fails
      virtualSolReserves = BigInt(0);
      virtualTokenReserves = BigInt(0);
      realSolReserves = BigInt(0);
      realTokenReserves = BigInt(0);
      complete = false;
    }
    
    return {
      tokenMint,
      solMint,
      tokenAMint: solMint, // SOL is token A
      tokenBMint: tokenMint, // Memecoin is token B
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      tokenDecimals: 6, // Pump.fun tokens typically use 6 decimals
      tokenADecimals: 9, // SOL decimals
      tokenBDecimals: 6, // Pump.fun standard token decimals
      complete,
    };
    
  } catch (error: any) {
    console.error(`[PumpfunParser] ❌ Failed to parse bonding curve:`, error.message);
    throw new Error(`Failed to parse Pump.fun bonding curve: ${error.message}`);
  }
}

/**
 * Parse Pump.fun bonding curve and fetch full reserves
 * Returns parsed data in a format compatible with helius-client.ts
 */
export async function parsePumpfunPoolWithReserves(
  connection: Connection,
  accountData: Buffer,
  tokenMintOverride?: string
): Promise<ParsedPumpfunBondingCurve> {
  const parsed = parsePumpfunBondingCurve(accountData, tokenMintOverride);
  
  console.log(`[PumpfunParser] 🔍 Fetching actual vault balances...`);
  
  // For pump.fun, we use the real reserves from the bonding curve
  // No need to fetch vault balances separately
  const tokenAReserve = Number(parsed.realSolReserves) / 1e9; // SOL decimals = 9
  const tokenBReserve = Number(parsed.realTokenReserves) / (10 ** parsed.tokenDecimals);
  
  console.log(`[PumpfunParser] ✅ SOL Reserve: ${tokenAReserve}`);
  console.log(`[PumpfunParser] ✅ Token Reserve: ${tokenBReserve}`);
  
  return parsed;
}

/**
 * Assess Pump.fun bonding curve health
 */
export function assessPumpfunPoolHealth(parsed: ParsedPumpfunBondingCurve): {
  status: string;
  isHealthy: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check if bonding curve is complete (migrated)
  if (parsed.complete) {
    issues.push('Bonding curve complete - token migrated to Raydium');
  }
  
  // Check if there are real reserves
  if (parsed.realSolReserves === BigInt(0)) {
    issues.push('No SOL liquidity in bonding curve');
  }
  
  if (parsed.realTokenReserves === BigInt(0)) {
    issues.push('No token liquidity in bonding curve');
  }
  
  const isHealthy = issues.length === 0 || (issues.length === 1 && parsed.complete);
  
  return {
    status: isHealthy ? 'Healthy' : 'Issues Detected',
    isHealthy,
    issues,
  };
}

