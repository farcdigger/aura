/**
 * Token Security Checker
 * 
 * Fetches token security information from Birdeye API
 * Supports both Solana and EVM chains (Base, BSC)
 * 
 * EVM-specific risks:
 * - Buy/Sell Tax
 * - Honeypot detection
 * - Proxy contract detection
 * - Transfer pausable
 */

import type { Network } from './types';

const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY!;

/**
 * EVM Token Security Information
 * Based on Birdeye API /defi/token_security endpoint
 */
export interface EvmTokenSecurity {
  // Tax information
  buyTax?: number; // Buy tax percentage (0-100)
  sellTax?: number; // Sell tax percentage (0-100)
  transferTax?: number; // Transfer tax percentage (0-100)
  
  // Security flags
  isHoneypot?: boolean; // Token cannot be sold (honeypot)
  isProxy?: boolean; // Contract is a proxy (can be upgraded)
  transferPausable?: boolean; // Transfers can be paused by owner
  mintable?: boolean; // Token can be minted (new tokens created)
  burnable?: boolean; // Token can be burned (tokens destroyed)
  
  // Ownership
  ownerAddress?: string; // Contract owner address
  hasOwner?: boolean; // Contract has an owner
  
  // Additional security info
  isOpenSource?: boolean; // Contract source code is verified
  isBlacklisted?: boolean; // Token is blacklisted
  isWhitelisted?: boolean; // Token has whitelist restrictions
  
  // Risk score (if provided by API)
  riskScore?: number; // Overall risk score (0-100, higher = more risky)
}

/**
 * Solana Token Security Information
 * Based on token metadata and authorities
 */
export interface SolanaTokenSecurity {
  freezeAuthority?: string | null; // Address that can freeze tokens
  mintAuthority?: string | null; // Address that can mint new tokens
  hasFreezeAuthority?: boolean; // Token can be frozen
  hasMintAuthority?: boolean; // Token can be minted
}

/**
 * Unified Token Security (works for both Solana and EVM)
 */
export interface TokenSecurity {
  network: Network;
  tokenAddress: string;
  
  // EVM-specific (only for Base/BSC)
  evmSecurity?: EvmTokenSecurity;
  
  // Solana-specific (only for Solana)
  solanaSecurity?: SolanaTokenSecurity;
  
  // Overall risk indicators
  hasHighRisk?: boolean; // True if any high-risk indicators are present
  riskFactors: string[]; // List of risk factors found
}

/**
 * Get EVM token security information from Birdeye API
 * 
 * @param tokenAddress Token contract address
 * @param network Network (base or bsc)
 * @returns EVM token security information
 */
export async function getEvmTokenSecurity(
  tokenAddress: string,
  network: 'base' | 'bsc'
): Promise<EvmTokenSecurity | null> {
  try {
    const chainHeader = network === 'base' ? 'base' : 'bsc';
    
    const url = `${BIRDEYE_API_BASE}/defi/token_security?address=${tokenAddress}`;
    
    console.log(`[TokenSecurity] 🔍 Fetching EVM token security for: ${tokenAddress} (${network})`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'x-chain': chainHeader,
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[TokenSecurity] ⚠️ API error (${response.status}):`, errorText.substring(0, 200));
      
      // If endpoint doesn't exist or not available, return null (not critical)
      if (response.status === 404 || response.status === 403) {
        console.warn(`[TokenSecurity] ⚠️ Token security endpoint not available for ${network}`);
        return null;
      }
      
      throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Parse Birdeye API response
    // Note: Response format may vary, adjust as needed
    const securityData = data.data || data;
    
    const security: EvmTokenSecurity = {
      buyTax: securityData.buyTax !== undefined ? parseFloat(securityData.buyTax) : undefined,
      sellTax: securityData.sellTax !== undefined ? parseFloat(securityData.sellTax) : undefined,
      transferTax: securityData.transferTax !== undefined ? parseFloat(securityData.transferTax) : undefined,
      
      isHoneypot: securityData.isHoneypot !== undefined ? Boolean(securityData.isHoneypot) : undefined,
      isProxy: securityData.isProxy !== undefined ? Boolean(securityData.isProxy) : undefined,
      transferPausable: securityData.transferPausable !== undefined ? Boolean(securityData.transferPausable) : undefined,
      mintable: securityData.mintable !== undefined ? Boolean(securityData.mintable) : undefined,
      burnable: securityData.burnable !== undefined ? Boolean(securityData.burnable) : undefined,
      
      ownerAddress: securityData.ownerAddress || securityData.owner,
      hasOwner: securityData.hasOwner !== undefined ? Boolean(securityData.hasOwner) : undefined,
      
      isOpenSource: securityData.isOpenSource !== undefined ? Boolean(securityData.isOpenSource) : undefined,
      isBlacklisted: securityData.isBlacklisted !== undefined ? Boolean(securityData.isBlacklisted) : undefined,
      isWhitelisted: securityData.isWhitelisted !== undefined ? Boolean(securityData.isWhitelisted) : undefined,
      
      riskScore: securityData.riskScore !== undefined ? parseFloat(securityData.riskScore) : undefined,
    };

    console.log(`[TokenSecurity] ✅ EVM token security fetched:`, {
      hasTax: !!(security.buyTax || security.sellTax),
      isHoneypot: security.isHoneypot,
      isProxy: security.isProxy,
      riskScore: security.riskScore,
    });

    return security;

  } catch (error: any) {
    console.error(`[TokenSecurity] ❌ Failed to fetch EVM token security:`, error.message);
    // Return null on error (not critical for analysis)
    return null;
  }
}

/**
 * Get Solana token security information from token metadata
 * 
 * @param tokenMetadata Token metadata (from Helius or Birdeye)
 * @returns Solana token security information
 */
export function getSolanaTokenSecurity(tokenMetadata: {
  authorities?: {
    freezeAuthority?: string | null;
    mintAuthority?: string | null;
  };
}): SolanaTokenSecurity {
  const authorities = tokenMetadata.authorities || {};
  
  return {
    freezeAuthority: authorities.freezeAuthority || null,
    mintAuthority: authorities.mintAuthority || null,
    hasFreezeAuthority: !!authorities.freezeAuthority,
    hasMintAuthority: !!authorities.mintAuthority,
  };
}

/**
 * Get unified token security information
 * 
 * @param tokenAddress Token address
 * @param network Network
 * @param tokenMetadata Optional: Token metadata (for Solana)
 * @returns Unified token security information
 */
export async function getTokenSecurity(
  tokenAddress: string,
  network: Network,
  tokenMetadata?: {
    authorities?: {
      freezeAuthority?: string | null;
      mintAuthority?: string | null;
    };
  }
): Promise<TokenSecurity> {
  const riskFactors: string[] = [];
  let hasHighRisk = false;

  // Get network-specific security info
  let evmSecurity: EvmTokenSecurity | null = null;
  let solanaSecurity: SolanaTokenSecurity | undefined = undefined;

  if (network === 'base' || network === 'bsc') {
    // EVM chain - fetch from Birdeye API
    evmSecurity = await getEvmTokenSecurity(tokenAddress, network);
    
    if (evmSecurity) {
      // Check for high-risk indicators
      if (evmSecurity.isHoneypot) {
        riskFactors.push('Honeypot detected - token cannot be sold');
        hasHighRisk = true;
      }
      
      if (evmSecurity.isProxy) {
        riskFactors.push('Proxy contract - code can be upgraded');
        hasHighRisk = true;
      }
      
      if (evmSecurity.transferPausable) {
        riskFactors.push('Transfer pausable - owner can pause transfers');
        hasHighRisk = true;
      }
      
      if (evmSecurity.buyTax && evmSecurity.buyTax > 10) {
        riskFactors.push(`High buy tax: ${evmSecurity.buyTax}%`);
        hasHighRisk = true;
      }
      
      if (evmSecurity.sellTax && evmSecurity.sellTax > 10) {
        riskFactors.push(`High sell tax: ${evmSecurity.sellTax}%`);
        hasHighRisk = true;
      }
      
      if (evmSecurity.mintable) {
        riskFactors.push('Token is mintable - supply can increase');
      }
    }
  } else if (network === 'solana' && tokenMetadata) {
    // Solana - use token metadata
    solanaSecurity = getSolanaTokenSecurity(tokenMetadata);
    
    if (solanaSecurity.hasFreezeAuthority) {
      riskFactors.push('Freeze authority exists - tokens can be frozen');
      hasHighRisk = true;
    }
    
    if (solanaSecurity.hasMintAuthority) {
      riskFactors.push('Mint authority exists - supply can increase');
    }
  }

  return {
    network,
    tokenAddress,
    evmSecurity: evmSecurity || undefined,
    solanaSecurity,
    hasHighRisk,
    riskFactors,
  };
}

