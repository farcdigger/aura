// apps/solana-liquidity-agent/src/lib/jupiter-client.ts

/**
 * Jupiter API Client
 * 
 * Jupiter is Solana's leading DEX aggregator that indexes all major DEXs.
 * We use it to quickly find the best liquidity pool for any token.
 * 
 * Benefits:
 * - 1 API call vs 50+ RPC calls
 * - Always returns the most liquid pool
 * - Free API with 600 req/min rate limit
 */

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | any;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;        // 🎯 This is the pool address we need!
      label: string;         // DEX name (e.g., "Raydium", "Orca")
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

/**
 * Find the best liquidity pool for a token using Jupiter API
 * 
 * @param tokenMint - The token mint address to find pools for
 * @param quoteMint - The quote token (default: USDC)
 * @returns Pool address of the most liquid pool, or null if not found
 */
export async function findBestPoolViaJupiter(
  tokenMint: string,
  quoteMint: string = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
): Promise<{ poolAddress: string; dexLabel: string } | null> {
  try {
    // Check if Jupiter API key is available
    const apiKey = process.env.JUPITER_API_KEY;
    
    if (!apiKey) {
      console.log(`[Jupiter] ⚠️ No API key found, skipping Jupiter API`);
      return null;
    }
    
    console.log(`[Jupiter] 🔍 Finding best pool for token: ${tokenMint.slice(0, 8)}...`);
    
    // Use a small amount (0.001 tokens) to get the best route
    const amount = 1000000; // 1 USDC worth (in lamports)
    
    // Jupiter API endpoint (requires API key)
    const url = new URL('https://quote-api.jup.ag/v6/quote');
    url.searchParams.append('inputMint', tokenMint);
    url.searchParams.append('outputMint', quoteMint);
    url.searchParams.append('amount', amount.toString());
    url.searchParams.append('onlyDirectRoutes', 'true'); // Only direct swaps (single pool)
    url.searchParams.append('slippageBps', '50'); // 0.5% slippage
    
    console.log(`[Jupiter] 📡 Calling Jupiter API (with key)...`);
    console.log(`[Jupiter] 🔗 URL: ${url.toString()}`);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Solana-Liquidity-Agent/1.0',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Jupiter] ❌ API error: ${response.status} ${response.statusText}`);
      console.log(`[Jupiter] ❌ Response: ${errorText.slice(0, 200)}`);
      return null;
    }
    
    const data: JupiterQuoteResponse = await response.json();
    
    if (!data.routePlan || data.routePlan.length === 0) {
      console.log(`[Jupiter] ⚠️ No routes found for this token`);
      return null;
    }
    
    // Get the first (best) route
    const bestRoute = data.routePlan[0];
    const poolAddress = bestRoute.swapInfo.ammKey;
    const dexLabel = bestRoute.swapInfo.label;
    
    if (!poolAddress) {
      console.log(`[Jupiter] ⚠️ No pool address in route`);
      return null;
    }
    
    console.log(`[Jupiter] ✅ Best pool found!`);
    console.log(`[Jupiter]    Pool: ${poolAddress}`);
    console.log(`[Jupiter]    DEX: ${dexLabel}`);
    console.log(`[Jupiter]    Price Impact: ${data.priceImpactPct}%`);
    
    return {
      poolAddress,
      dexLabel,
    };
    
  } catch (error: any) {
    console.error(`[Jupiter] ❌ Error:`, error.message);
    console.error(`[Jupiter] ❌ Error Type:`, error.name);
    console.error(`[Jupiter] ❌ Full Error:`, error);
    
    // Check if it's a network issue
    if (error.message.includes('fetch') || error.message.includes('connect')) {
      console.error(`[Jupiter] 🌐 Network issue detected - Jupiter API might be unreachable`);
      console.error(`[Jupiter] 💡 Suggestion: Check internet connection or firewall settings`);
    }
    
    return null;
  }
}

/**
 * Try to find pool with alternative quote tokens
 * If token/USDC pair doesn't exist, try token/SOL
 */
export async function findBestPoolWithFallback(
  tokenMint: string
): Promise<{ poolAddress: string; dexLabel: string } | null> {
  // Try USDC first (most common)
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  let result = await findBestPoolViaJupiter(tokenMint, USDC);
  
  if (result) {
    return result;
  }
  
  console.log(`[Jupiter] 🔄 No USDC pair found, trying SOL pair...`);
  
  // Try SOL (second most common)
  const SOL = 'So11111111111111111111111111111111111111112';
  result = await findBestPoolViaJupiter(tokenMint, SOL);
  
  if (result) {
    return result;
  }
  
  console.log(`[Jupiter] ❌ No liquid pools found via Jupiter`);
  return null;
}

