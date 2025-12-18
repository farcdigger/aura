/**
 * Address Validator
 * 
 * Validates and normalizes addresses for different networks:
 * - Solana: Base58 format (32-44 characters)
 * - Base/BSC (EVM): Hex format (0x + 40 hex characters, 42 total)
 * 
 * Also provides network detection based on address format.
 */

import { PublicKey } from '@solana/web3.js';
import { isAddress as isEvmAddress, getAddress } from 'ethers';
import type { Network } from './types';

export interface AddressValidationResult {
  valid: boolean;
  network?: Network;
  normalized?: string;
  error?: string;
}

/**
 * Check if address is a valid Solana address (Base58)
 */
function isSolanaAddress(address: string): boolean {
  try {
    // Solana addresses are Base58 encoded, 32-44 characters
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    // Try to create PublicKey - if it succeeds, it's valid
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect EVM network from address (Base vs BSC)
 * Note: Address format is the same for both, so we need additional context
 * For now, we'll return 'base' as default for EVM addresses
 * Network should be explicitly provided by the user
 */
function detectEvmNetwork(address: string): Network {
  // Both Base and BSC use the same address format
  // We can't detect from address alone, so default to 'base'
  // User should explicitly specify network
  return 'base';
}

/**
 * Validate and normalize an address for a given network
 * 
 * @param address Address to validate
 * @param network Optional network hint (if not provided, will try to detect)
 * @returns Validation result with normalized address and detected network
 */
export function validateAddress(
  address: string,
  network?: Network
): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return {
      valid: false,
      error: 'Address must be a non-empty string',
    };
  }

  const trimmedAddress = address.trim();

  // Solana validation
  if (network === 'solana' || (!network && isSolanaAddress(trimmedAddress))) {
    try {
      // Validate Solana address
      new PublicKey(trimmedAddress);
      return {
        valid: true,
        network: 'solana',
        normalized: trimmedAddress,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: 'Invalid Solana address format',
      };
    }
  }

  // EVM validation (Base/BSC)
  if (
    network === 'base' ||
    network === 'bsc' ||
    (!network && (trimmedAddress.startsWith('0x') || trimmedAddress.startsWith('0X')))
  ) {
    // Check if it's a valid EVM address
    if (!isEvmAddress(trimmedAddress)) {
      return {
        valid: false,
        error: 'Invalid EVM address format (must be 0x followed by 40 hex characters)',
      };
    }

    // Normalize to checksummed address (EIP-55)
    const checksummed = getAddress(trimmedAddress);

    // If network was provided, use it; otherwise detect (default to base)
    const detectedNetwork = network || detectEvmNetwork(trimmedAddress);

    return {
      valid: true,
      network: detectedNetwork,
      normalized: checksummed.toLowerCase(), // Store lowercase in DB for consistency
    };
  }

  // If network is specified but address doesn't match format
  if (network) {
    if (network === 'solana' && !isSolanaAddress(trimmedAddress)) {
      return {
        valid: false,
        error: `Address does not match Solana format (expected Base58, 32-44 chars)`,
      };
    }
    if ((network === 'base' || network === 'bsc') && !trimmedAddress.startsWith('0x')) {
      return {
        valid: false,
        error: `Address does not match EVM format (expected 0x followed by 40 hex characters)`,
      };
    }
  }

  return {
    valid: false,
    error: 'Unknown address format. Expected Solana (Base58) or EVM (0x...) format.',
  };
}

/**
 * Detect network from address format
 * 
 * @param address Address to analyze
 * @returns Detected network or null if format is unknown
 */
export function detectNetwork(address: string): Network | null {
  const validation = validateAddress(address);
  return validation.valid ? validation.network || null : null;
}

/**
 * Normalize address for storage
 * 
 * @param address Address to normalize
 * @param network Network the address belongs to
 * @returns Normalized address (lowercase for EVM, original for Solana)
 */
export function normalizeAddress(address: string, network: Network): string {
  if (network === 'solana') {
    return address.trim();
  }

  // EVM addresses: normalize to lowercase
  if (address.startsWith('0x') || address.startsWith('0X')) {
    try {
      const checksummed = getAddress(address);
      return checksummed.toLowerCase();
    } catch {
      return address.toLowerCase();
    }
  }

  return address.trim();
}

