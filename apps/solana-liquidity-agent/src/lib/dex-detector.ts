/**
 * DEX Detector
 * 
 * Normalizes DEX names from Birdeye API source field
 * Maps network-specific DEX identifiers to human-readable names
 */

import type { Network } from './types';

/**
 * DEX name mapping by network
 * Maps Birdeye API source field to normalized DEX names
 */
const DEX_MAP: Record<Network, Record<string, string>> = {
  'solana': {
    'raydium': 'Raydium',
    'raydium_v4': 'Raydium V4',
    'raydium_clmm': 'Raydium CLMM',
    'orca': 'Orca',
    'orca_whirlpool': 'Orca Whirlpool',
    'jupiter': 'Jupiter',
    'meteora': 'Meteora',
    'pump_amm': 'Pump.fun',
    'pumpfun': 'Pump.fun',
    'lifinity': 'Lifinity',
    'aldrin': 'Aldrin',
    'saber': 'Saber',
    'serum': 'Serum',
    'openbook': 'OpenBook',
  },
  'base': {
    'aerodrome': 'Aerodrome',
    'aerodrome_slipstream': 'Aerodrome Slipstream',
    'uniswap_v3': 'Uniswap V3',
    'uniswap_v2': 'Uniswap V2',
    'baseswap': 'BaseSwap',
    'baseswap_v2': 'BaseSwap V2',
    'baseswap_v3': 'BaseSwap V3',
    'swapbased': 'SwapBased',
    'dackieswap': 'DackieSwap',
    'sushi': 'SushiSwap',
    'sushiswap': 'SushiSwap',
    'balancer': 'Balancer',
    'curve': 'Curve',
  },
  'bsc': {
    'pancakeswap': 'PancakeSwap',
    'pancakeswap_v2': 'PancakeSwap V2',
    'pancakeswap_v3': 'PancakeSwap V3',
    'biswap': 'Biswap',
    'apeswap': 'ApeSwap',
    'babyswap': 'BabySwap',
    'mdex': 'MDEX',
    'nomiswap': 'Nomiswap',
    'safeswap': 'SafeSwap',
    'uniswap_v2': 'Uniswap V2 (BSC)',
    'uniswap_v3': 'Uniswap V3 (BSC)',
    'sushi': 'SushiSwap (BSC)',
    'sushiswap': 'SushiSwap (BSC)',
  },
};

/**
 * Normalize DEX name from Birdeye API source field
 * 
 * @param source Source field from Birdeye API (e.g., 'pancakeswap', 'aerodrome')
 * @param network Network the transaction belongs to
 * @returns Normalized DEX name (e.g., 'PancakeSwap', 'Aerodrome')
 */
export function normalizeDexName(source: string, network: Network): string {
  if (!source) {
    return 'Unknown DEX';
  }

  const normalizedSource = source.toLowerCase().trim();
  const networkMap = DEX_MAP[network];
  
  if (networkMap && networkMap[normalizedSource]) {
    return networkMap[normalizedSource];
  }

  // Fallback: Capitalize first letter of each word
  return source
    .split(/[_\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if a source is a known DEX for the given network
 * 
 * @param source Source field from Birdeye API
 * @param network Network to check
 * @returns True if source is a known DEX
 */
export function isKnownDEX(source: string, network: Network): boolean {
  if (!source) {
    return false;
  }

  const normalizedSource = source.toLowerCase().trim();
  const networkMap = DEX_MAP[network];
  
  return networkMap ? normalizedSource in networkMap : false;
}

/**
 * Get all known DEXs for a network
 * 
 * @param network Network to get DEXs for
 * @returns Array of normalized DEX names
 */
export function getKnownDEXs(network: Network): string[] {
  const networkMap = DEX_MAP[network];
  return networkMap ? Object.values(networkMap) : [];
}

