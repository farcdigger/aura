/**
 * NFT Verification Cache Helper
 * Caches NFT verification status in LocalStorage to avoid repeated API calls
 */

const CACHE_KEY_PREFIX = "nft_verification_";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export interface NFTVerificationCache {
  verified: boolean;
  tokenId: number | null;
  verifiedAt: number; // timestamp
}

/**
 * Get cached NFT verification for a wallet address
 */
export function getCachedNFTVerification(walletAddress: string): NFTVerificationCache | null {
  if (typeof window === "undefined") return null;
  
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;
    
    const data: NFTVerificationCache = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - data.verifiedAt > CACHE_DURATION) {
      // Cache expired, remove it
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("Error reading NFT verification cache:", error);
    return null;
  }
}

/**
 * Cache NFT verification result
 */
export function setCachedNFTVerification(
  walletAddress: string,
  verified: boolean,
  tokenId: number | null
): void {
  if (typeof window === "undefined") return;
  
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
    const data: NFTVerificationCache = {
      verified,
      tokenId,
      verifiedAt: Date.now(),
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    console.error("Error caching NFT verification:", error);
  }
}

/**
 * Clear NFT verification cache for a wallet address
 */
export function clearCachedNFTVerification(walletAddress: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error("Error clearing NFT verification cache:", error);
  }
}

/**
 * Clear all NFT verification caches
 */
export function clearAllNFTVerificationCaches(): void {
  if (typeof window === "undefined") return;
  
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error("Error clearing all NFT verification caches:", error);
  }
}

/**
 * Check NFT ownership with cache support
 * Returns cached result if available, otherwise makes API call
 */
export async function checkNFTOwnershipWithCache(
  walletAddress: string
): Promise<{ hasNFT: boolean; tokenId: number | null; fromCache: boolean }> {
  // Check cache first
  const cached = getCachedNFTVerification(walletAddress);
  if (cached) {
    return {
      hasNFT: cached.verified,
      tokenId: cached.tokenId,
      fromCache: true,
    };
  }
  
  // Cache miss, make API call
  try {
    // Send address as-is, API will normalize it properly
    // But use lowercase for cache key consistency
    const cacheKey = walletAddress.toLowerCase();
    
    console.log("🔍 Making NFT check API call:", {
      walletAddress,
      cacheKey,
    });
    
    const response = await fetch("/api/chat/check-nft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });
    
    if (!response.ok) {
      console.error("❌ NFT check API error:", {
        status: response.status,
        statusText: response.statusText,
        walletAddress,
      });
      const errorData = await response.json().catch(() => ({}));
      console.error("Error details:", errorData);
      return { hasNFT: false, tokenId: null, fromCache: false };
    }
    
    const data = await response.json();
    console.log("✅ NFT check API response:", {
      walletAddress,
      data,
      hasNFT: data.hasNFT,
      tokenId: data.tokenId,
    });
    const hasNFT = data.hasNFT || false;
    const tokenId = data.tokenId || null;
    
    // Cache the result using lowercase key for consistency
    setCachedNFTVerification(cacheKey, hasNFT, tokenId);
    
    return {
      hasNFT,
      tokenId,
      fromCache: false,
    };
  } catch (error: any) {
    console.error("❌ Error checking NFT ownership:", {
      error: error.message,
      walletAddress,
    });
    return { hasNFT: false, tokenId: null, fromCache: false };
  }
}

