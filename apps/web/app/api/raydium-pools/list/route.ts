import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET endpoint to list Raydium pools with token metadata
 * Usage: 
 *   /api/raydium-pools/list?pageSize=50&skipTop=10
 *   /api/raydium-pools/list?pageSize=100&skipTop=0 (to see top pools)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
    const skipTop = parseInt(url.searchParams.get("skipTop") || "0", 10);
    const sortBy = (url.searchParams.get("sortBy") || "volume_24h") as "volume_24h" | "volume_7d" | "tvl";
    const poolType = (url.searchParams.get("poolType") || "all") as "all" | "standard" | "clmm";

    console.log(`[api/raydium-pools/list] Fetching pools: pageSize=${pageSize}, skipTop=${skipTop}, sortBy=${sortBy}`);

    // Fetch from Raydium API
    const raydiumApiUrl = "https://api-v3.raydium.io";
    const params = new URLSearchParams({
      poolSortField: sortBy,
      sortType: "desc",
      pageSize: String(Math.min(pageSize + skipTop, 100)), // Raydium API limit is usually 100
      poolType,
    });

    const response = await fetch(`${raydiumApiUrl}/pools/info/list?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Raydium API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const allPools = data.data || [];

    // Skip top N pools
    const pools = allPools.slice(skipTop, skipTop + pageSize);

    // Format pool data for display
    const formattedPools = pools.map((pool: any, index: number) => ({
      rank: skipTop + index + 1,
      poolAddress: pool.id,
      tokenA: {
        mint: pool.mintA,
        decimals: pool.mintA_decimals,
        // Note: Token symbols/names would require additional API calls to Helius DAS API
        // For now, we show mint addresses
      },
      tokenB: {
        mint: pool.mintB,
        decimals: pool.mintB_decimals,
      },
      volume24h: pool.volume_24h || 0,
      volume7d: pool.volume_7d || 0,
      tvl: pool.tvl || 0,
      poolType: pool.poolType || "standard",
      // Additional metrics
      feeRate: pool.feeRate,
      apr: pool.apr,
      // Short mint addresses for display
      tokenA_short: pool.mintA?.substring(0, 8) + "..." || "unknown",
      tokenB_short: pool.mintB?.substring(0, 8) + "..." || "unknown",
    }));

    // Calculate summary statistics
    const totalVolume24h = formattedPools.reduce((sum: number, p: any) => sum + (p.volume24h || 0), 0);
    const totalTVL = formattedPools.reduce((sum: number, p: any) => sum + (p.tvl || 0), 0);
    const averageVolume24h = formattedPools.length > 0 ? totalVolume24h / formattedPools.length : 0;

    return NextResponse.json(
      {
        success: true,
        metadata: {
          totalFetched: allPools.length,
          skipped: skipTop,
          displayed: pools.length,
          sortBy,
          poolType,
        },
        pools: formattedPools,
        summary: {
          totalVolume24h: totalVolume24h.toFixed(2),
          totalTVL: totalTVL.toFixed(2),
          averageVolume24h: averageVolume24h.toFixed(2),
          minVolume24h: Math.min(...formattedPools.map((p: any) => p.volume24h || 0)).toFixed(2),
          maxVolume24h: Math.max(...formattedPools.map((p: any) => p.volume24h || 0)).toFixed(2),
        },
        // Helper: Suggested ranges for interesting pools
        suggestions: {
          top10: "Skip 0, take 10 - Most popular pools (SOL/USDC, etc.)",
          memecoinRange: `Skip ${skipTop}, take ${pageSize} - Current selection (likely memecoins)`,
          midTier: `Skip 20-30, take 10-15 - Mid-tier active pools`,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[api/raydium-pools/list] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch pools",
      },
      { status: 500 }
    );
  }
}
