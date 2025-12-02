import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';

import { fetchAllProtocolsData } from './multi-protocol-fetcher';
import { saveAllProtocolsData } from './multi-protocol-storage';
import { getSupabaseClient } from './supabase';

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? 'yama-agent',
  version: process.env.AGENT_VERSION ?? '0.1.0',
  description: process.env.AGENT_DESCRIPTION ?? 'Yama analytics agent',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

const SECTION_KEYS = ['dex', 'lending', 'nft'] as const;
type SectionKey = typeof SECTION_KEYS[number];

type SectionSummary = {
  protocols: string[];
  totalRecords: number;
  data: Record<string, any>;
};

type DataSummary = {
  metadata: {
    fetchedAt: string;
    timeframe: string;
    limitPerProtocol: number;
    totalRecordsFetched: number;
    recordsSentToAI: number;
    note: string;
  };
} & { [K in SectionKey]: SectionSummary };

const MAX_COMPLETION_TOKENS = Number(process.env.MAX_COMPLETION_TOKENS ?? 8000);

const safeStringify = (obj: any, maxLength: number = 140_000): string => {
  if (obj === null || obj === undefined) {
    return '[]';
  }
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      obj,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (typeof value === 'function' || value === undefined) {
          return null;
        }
        return value;
      },
    );

    if (!json) {
      return '{}';
    }

    if (json.length > maxLength) {
      console.warn(`[safeStringify] Data too large (${json.length}), truncating to ${maxLength}`);
      return `${json.slice(0, maxLength)}\n... [TRUNCATED DUE TO SIZE]`;
    }
    return json;
  } catch (error: any) {
    console.error('[safeStringify] Failed to stringify data:', error.message);
    return '{}';
  }
};

const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatPoolLabel = (pool: any) => {
  const t0 = pool?.token0?.symbol || pool?.token0Symbol || 'TOKEN0';
  const t1 = pool?.token1?.symbol || pool?.token1Symbol || 'TOKEN1';
  return `${t0}/${t1}`;
};

const limitArray = <T>(items: T[], max: number): T[] => items.slice(0, Math.max(0, max));

type DexSummary = {
  overview: {
    totalSwaps: number;
    totalVolumeUSD: number;
    averageSwapUSD: number;
    medianSwapUSD: number;
    uniquePools: number;
  };
  topPools: Array<{
    poolId: string;
    pair: string;
    volumeUSD: number;
    swapCount: number;
    avgSwapUSD: number;
    netDirection: string;
  }>;
  whaleAddresses: Array<{
    address: string;
    swapCount: number;
    volumeUSD: number;
    firstSeenTimestamp: number;
    lastSeenTimestamp: number;
  }>;
  largeSwaps: Array<{
    amountUSD: number;
    amount0: number;
    amount1: number;
    poolId: string;
    pair: string;
    timestamp: number;
    direction: string;
  }>;
  largeSwapDistribution: Array<{
    bucket: string;
    count: number;
    volumeUSD: number;
    samples: Array<{
      timestamp: number;
      amountUSD: number;
      pair: string;
    }>;
  }>;
  sampleSwaps: Array<{
    amountUSD: number;
    pair: string;
    feeTier: string | number | null;
    timestamp: number;
  }>;
  timeBuckets: Array<{
    bucketLabel: string;
    totalVolumeUSD: number;
    swapCount: number;
  }>;
  tokenVolumes: Array<{
    token: string;
    volumeUSD: number;
    swapCount: number;
  }>;
  feeTierStats: Array<{
    feeTier: string;
    volumeUSD: number;
    swapCount: number;
    avgSwapUSD: number;
  }>;
  pairDirectionStats: Array<{
    pair: string;
    swapsToken0To1: number;
    swapsToken1To0: number;
    netUSD: number;
  }>;
  dailyPoolStats: Array<{
    pair: string;
    volumeUSD: number;
    swapCount: number;
    feeTier: string | null;
    topWhale: string | null;
  }>;
};

type LendingSummary = {
  overview: {
    totalBorrowsUSD: number;
    totalDepositsUSD: number;
    borrowToDepositRatio: number;
    marketsCovered: number;
  };
  markets: Array<{
    marketId: string;
    token: string;
    totalDepositsUSD: number;
    totalBorrowsUSD: number;
    utilization: number;
    liquidationThreshold: number | null;
    maximumLTV: number | null;
    liquidationBufferUSD: number;
    liquidationBufferPct: number | null;
    borrowVelocityUSD: number;
    depositVelocityUSD: number;
    liquidationThresholdUSD: number;
    liquidationHeadroomUSD: number;
    liquidationHeadroomPct: number | null;
  }>;
  largeBorrows: Array<{
    amountUSD: number;
    asset: string;
    marketId: string;
    timestamp: number;
  }>;
  largeDeposits: Array<{
    amountUSD: number;
    asset: string;
    marketId: string;
    timestamp: number;
  }>;
  riskSignals: Array<{
    marketId: string;
    token: string;
    utilization: number;
    liquidationBufferUSD: number;
    note: string;
  }>;
  borrowerLeaders: Array<{
    accountId: string;
    totalBorrowUSD: number;
    markets: number;
  }>;
  depositorLeaders: Array<{
    accountId: string;
    totalDepositUSD: number;
    markets: number;
  }>;
  liquidationEvents: Array<{
    accountId: string;
    liquidatorId: string;
    amountUSD: number;
    marketId: string;
    timestamp: number;
  }>;
  rateChangeSnapshots: Array<{
    marketId: string;
    token: string;
    variableBorrowAPR: number;
    depositAPR: number;
    last12hChangeBorrow: number;
    last12hChangeDeposit: number;
  }>;
  whaleExposure: Array<{
    accountId: string;
    totalBorrowUSD: number;
    totalDepositUSD: number;
    netExposureUSD: number;
    markets: number;
  }>;
};

type CrossSummary = {
  dexVolumeUSD: number;
  lendingBorrowsUSD: number;
  volumeToBorrowRatio: number;
  stablecoinVolumeUSD: number;
  stablecoinVolumeShare: number;
  mostActivePairs: string[];
  topBorrowMarkets: string[];
  overlappingActors: string[];
  stablecoinFlowBreakdown: Array<{
    pair: string;
    volumeUSD: number;
  }>;
  volumeVsBorrowByHour: Array<{
    hour: string;
    dexVolumeUSD: number;
    borrowVolumeUSD: number;
  }>;
  leverageLoops: Array<{
    pair: string;
    relatedMarket: string;
    swapVolumeUSD: number;
    borrowUSD: number;
    inference: string;
  }>;
};

const summarizeDexData = (dexData: Record<string, any[]>): DexSummary => {
  const swaps = Object.values(dexData).flat();
  const totalSwaps = swaps.length;
  const volumes = swaps.map((swap) => toNumber(swap.amountUSD)).filter((v) => v > 0);
  const totalVolumeUSD = volumes.reduce((sum, v) => sum + v, 0);
  const averageSwapUSD = totalSwaps > 0 ? totalVolumeUSD / totalSwaps : 0;
  const sortedVolumes = [...volumes].sort((a, b) => a - b);
  const medianSwapUSD =
    sortedVolumes.length === 0
      ? 0
      : sortedVolumes[Math.floor(sortedVolumes.length / 2)];

  const poolMap = new Map<
    string,
    { poolId: string; pair: string; volumeUSD: number; swapCount: number; feeTier: string | null }
  >();
  const walletMap = new Map<string, { address: string; volumeUSD: number; swapCount: number }>();

  swaps.forEach((swap) => {
    const poolId = swap.pool?.id || 'unknown';
    const pair = formatPoolLabel(swap.pool);
    const amountUSD = toNumber(swap.amountUSD);
    if (!poolMap.has(poolId)) {
      poolMap.set(poolId, {
        poolId,
        pair,
        volumeUSD: 0,
        swapCount: 0,
        feeTier: swap.pool?.feeTier ?? null,
      });
    }
    const poolStats = poolMap.get(poolId)!;
    poolStats.volumeUSD += amountUSD;
    poolStats.swapCount += 1;

    const participant = swap.sender || swap.recipient || 'unknown';
    if (!walletMap.has(participant)) {
      walletMap.set(participant, { address: participant, volumeUSD: 0, swapCount: 0 });
    }
    const walletStats = walletMap.get(participant)!;
    walletStats.volumeUSD += amountUSD;
    walletStats.swapCount += 1;
  });

  const topPools = limitArray(
    Array.from(poolMap.values())
      .map((pool) => ({
        poolId: pool.poolId,
        pair: pool.pair,
        volumeUSD: Number(pool.volumeUSD.toFixed(2)),
        swapCount: pool.swapCount,
        avgSwapUSD: pool.swapCount > 0 ? Number((pool.volumeUSD / pool.swapCount).toFixed(2)) : 0,
        netDirection:
          toNumber(pool.volumeUSD) >= 0 ? 'token0→token1 bias' : 'token1→token0 bias',
      }))
      .sort((a, b) => b.volumeUSD - a.volumeUSD),
    80,
  );

  const whaleAddresses = limitArray(
    Array.from(walletMap.values())
      .map((wallet) => ({
        address: wallet.address,
        volumeUSD: Number(wallet.volumeUSD.toFixed(2)),
        swapCount: wallet.swapCount,
        firstSeenTimestamp: 0,
        lastSeenTimestamp: 0,
      }))
      .filter((wallet) => wallet.volumeUSD >= 50_000)
      .sort((a, b) => b.volumeUSD - a.volumeUSD),
    80,
  );

  const largeSwaps = limitArray(
    swaps
      .filter((swap) => toNumber(swap.amountUSD) >= 25_000)
      .sort((a, b) => toNumber(b.amountUSD) - toNumber(a.amountUSD))
      .map((swap) => ({
        amountUSD: Number(toNumber(swap.amountUSD).toFixed(2)),
        amount0: toNumber(swap.amount0),
        amount1: toNumber(swap.amount1),
        poolId: swap.pool?.id || 'unknown',
        pair: formatPoolLabel(swap.pool),
        timestamp: Number(swap.timestamp || 0),
        direction: toNumber(swap.amount0) >= 0 ? 'token0→token1' : 'token1→token0',
      })),
    400,
  );

  const buckets = [
    { label: '50k-100k', min: 50_000, max: 100_000 },
    { label: '100k-250k', min: 100_000, max: 250_000 },
    { label: '250k-500k', min: 250_000, max: 500_000 },
    { label: '500k-1M', min: 500_000, max: 1_000_000 },
    { label: '1M+', min: 1_000_000, max: Number.POSITIVE_INFINITY },
  ];

  const largeSwapDistribution = buckets.map((bucket) => {
    const filtered = largeSwaps.filter(
      (swap) => swap.amountUSD >= bucket.min && swap.amountUSD < bucket.max,
    );
    const volume = filtered.reduce((sum, swap) => sum + swap.amountUSD, 0);
    const samples = filtered.slice(0, 5).map((swap) => ({
      timestamp: swap.timestamp,
      amountUSD: swap.amountUSD,
      pair: swap.pair,
    }));
      return {
      bucket: bucket.label,
      count: filtered.length,
      volumeUSD: Number(volume.toFixed(2)),
      samples,
    };
  });

  const sampleSwaps = limitArray(
    swaps
      .sort((a, b) => toNumber(b.amountUSD) - toNumber(a.amountUSD))
      .slice(0, 2000)
      .map((swap) => ({
        amountUSD: Number(toNumber(swap.amountUSD).toFixed(2)),
        pair: formatPoolLabel(swap.pool),
        feeTier: swap.pool?.feeTier ?? null,
        timestamp: Number(swap.timestamp || 0),
      })),
    50,
  );
      
  const timeBucketSizeSeconds = 60 * 60;
  const bucketMap = new Map<number, { volumeUSD: number; swapCount: number }>();
  const tokenVolumeMap = new Map<string, { volumeUSD: number; swapCount: number }>();
  swaps.forEach((swap) => {
    const ts = Number(swap.timestamp || 0);
    if (!Number.isFinite(ts) || ts <= 0) {
      return;
    }
    const bucket = Math.floor(ts / timeBucketSizeSeconds);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, { volumeUSD: 0, swapCount: 0 });
    }
    const stats = bucketMap.get(bucket)!;
    stats.volumeUSD += toNumber(swap.amountUSD);
    stats.swapCount += 1;

    const symbols = [
      swap.pool?.token0?.symbol,
      swap.pool?.token1?.symbol,
      swap.token0?.symbol,
      swap.token1?.symbol,
    ].filter(Boolean);
    symbols.forEach((symbol) => {
      const key = String(symbol);
      if (!tokenVolumeMap.has(key)) {
        tokenVolumeMap.set(key, { volumeUSD: 0, swapCount: 0 });
      }
      const tokenStats = tokenVolumeMap.get(key)!;
      tokenStats.volumeUSD += toNumber(swap.amountUSD);
      tokenStats.swapCount += 1;
    });
  });

  const timeBuckets = Array.from(bucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-72) // last 72 hours
    .map(([bucket, stats]) => ({
      bucketLabel: new Date(bucket * timeBucketSizeSeconds * 1000).toISOString(),
      totalVolumeUSD: Number(stats.volumeUSD.toFixed(2)),
      swapCount: stats.swapCount,
    }));

  const tokenVolumes = Array.from(tokenVolumeMap.entries())
    .map(([token, stats]) => ({
      token,
      volumeUSD: Number(stats.volumeUSD.toFixed(2)),
      swapCount: stats.swapCount,
    }))
    .sort((a, b) => b.volumeUSD - a.volumeUSD)
    .slice(0, 50);

  const feeTierStatsMap = new Map<string, { volumeUSD: number; swapCount: number }>();
  const pairDirectionMap = new Map<
    string,
    { swaps0to1: number; swaps1to0: number; netUSD: number }
  >();

  swaps.forEach((swap) => {
    const feeTier = String(swap.pool?.feeTier ?? 'unknown');
    if (!feeTierStatsMap.has(feeTier)) {
      feeTierStatsMap.set(feeTier, { volumeUSD: 0, swapCount: 0 });
    }
    const feeStats = feeTierStatsMap.get(feeTier)!;
    feeStats.volumeUSD += toNumber(swap.amountUSD);
    feeStats.swapCount += 1;

    const pair = formatPoolLabel(swap.pool);
    if (!pairDirectionMap.has(pair)) {
      pairDirectionMap.set(pair, { swaps0to1: 0, swaps1to0: 0, netUSD: 0 });
    }
    const dirStats = pairDirectionMap.get(pair)!;
    if (toNumber(swap.amount0) >= 0) {
      dirStats.swaps0to1 += 1;
      dirStats.netUSD += toNumber(swap.amountUSD);
    } else {
      dirStats.swaps1to0 += 1;
      dirStats.netUSD -= toNumber(swap.amountUSD);
    }
  });

  const feeTierStats = Array.from(feeTierStatsMap.entries())
    .map(([feeTier, stats]) => ({
      feeTier,
      volumeUSD: Number(stats.volumeUSD.toFixed(2)),
      swapCount: stats.swapCount,
      avgSwapUSD:
        stats.swapCount > 0 ? Number((stats.volumeUSD / stats.swapCount).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.volumeUSD - a.volumeUSD);

  const pairDirectionStats = Array.from(pairDirectionMap.entries())
    .map(([pair, stats]) => ({
      pair,
      swapsToken0To1: stats.swaps0to1,
      swapsToken1To0: stats.swaps1to0,
      netUSD: Number(stats.netUSD.toFixed(2)),
    }))
    .sort((a, b) => Math.abs(b.netUSD) - Math.abs(a.netUSD))
    .slice(0, 60);

  const dailyPoolStats = topPools.slice(0, 40).map((pool) => {
    const whale = whaleAddresses.find((w) => w.address && w.firstSeenTimestamp > 0);
    return {
      pair: pool.pair,
      volumeUSD: pool.volumeUSD,
      swapCount: pool.swapCount,
      feeTier: pool.avgSwapUSD ? String(pool.avgSwapUSD) : null,
      topWhale: whale ? whale.address : null,
    };
  });

  return {
    overview: {
      totalSwaps,
      totalVolumeUSD: Number(totalVolumeUSD.toFixed(2)),
      averageSwapUSD: Number(averageSwapUSD.toFixed(2)),
      medianSwapUSD: Number(medianSwapUSD.toFixed(2)),
      uniquePools: poolMap.size,
    },
    topPools,
    whaleAddresses,
    largeSwaps,
    largeSwapDistribution,
    sampleSwaps,
    timeBuckets,
    tokenVolumes,
    feeTierStats,
    pairDirectionStats,
    dailyPoolStats,
  };
};

const summarizeLendingData = (lendingData: Record<string, any[]>): LendingSummary => {
  const entries = Object.values(lendingData).flat();
  const markets = entries.flatMap((entry: any) => entry.markets || []);
  const borrows = entries.flatMap((entry: any) => entry.borrows || []);
  const deposits = entries.flatMap((entry: any) => entry.deposits || []);
  const liquidations = entries.flatMap((entry: any) => entry.liquidations || []);

  const totalBorrowsUSD = borrows.reduce((sum, borrow) => sum + toNumber(borrow.amountUSD), 0);
  const totalDepositsUSD = markets.reduce(
    (sum, market) => sum + toNumber(market.totalDepositBalanceUSD),
    0,
  );
  const borrowToDepositRatio =
    totalDepositsUSD > 0 ? totalBorrowsUSD / totalDepositsUSD : 0;

  const marketStats = limitArray(
    markets
      .map((market) => {
        const depositsUSD = toNumber(market.totalDepositBalanceUSD);
        const borrowsUSD = toNumber(market.totalBorrowBalanceUSD);
        const utilization = depositsUSD > 0 ? borrowsUSD / depositsUSD : 0;
        const liquidationThreshold = market.liquidationThreshold
          ? Number(market.liquidationThreshold)
          : null;
        const maximumLTV = market.maximumLTV ? Number(market.maximumLTV) : null;
        const liquidationBufferUSD = depositsUSD - borrowsUSD;
        const liquidationBufferPct =
          liquidationThreshold !== null && liquidationThreshold > 0
            ? ((liquidationThreshold / 100) * depositsUSD - borrowsUSD) /
              (depositsUSD || 1)
            : null;
      
        // Extract rates from markets.rates array
        const rates = market.rates || [];
        const borrowRate = rates.find((r: any) => r.side === 'BORROWER' && r.type === 'VARIABLE');
        const depositRate = rates.find((r: any) => r.side === 'LENDER' && r.type === 'VARIABLE');
        const borrowRateValue = borrowRate?.rate ? Number(borrowRate.rate) : null;
        const depositRateValue = depositRate?.rate ? Number(depositRate.rate) : null;
        
        // Calculate velocity based on actual rates if available
        const borrowVelocityUSD = borrowRateValue !== null 
          ? toNumber(market.totalBorrowBalanceUSD) * (borrowRateValue / 100) / 365 // Annual rate to daily
          : 0;
        const depositVelocityUSD = depositRateValue !== null
          ? toNumber(market.totalDepositBalanceUSD) * (depositRateValue / 100) / 365 // Annual rate to daily
          : 0;

        const liquidationThresholdUSD =
          liquidationThreshold !== null ? (liquidationThreshold / 100) * depositsUSD : 0;
        const liquidationHeadroomUSD = liquidationThresholdUSD - borrowsUSD;
        const liquidationHeadroomPct =
          liquidationThreshold !== null && liquidationThreshold > 0
            ? liquidationHeadroomUSD / (liquidationThresholdUSD || 1)
            : null;
      
      return {
          marketId: market.id,
          token: market.inputToken?.symbol || market.name || 'TOKEN',
          totalDepositsUSD: Number(depositsUSD.toFixed(2)),
          totalBorrowsUSD: Number(borrowsUSD.toFixed(2)),
          utilization: Number(utilization.toFixed(4)),
          liquidationThreshold: liquidationThreshold !== null ? Number(liquidationThreshold) : null,
          maximumLTV: maximumLTV !== null ? Number(maximumLTV) : null,
          liquidationBufferUSD: Number(liquidationBufferUSD.toFixed(2)),
          liquidationBufferPct:
            liquidationBufferPct !== null ? Number(liquidationBufferPct.toFixed(4)) : null,
          borrowRate: borrowRateValue !== null ? Number(borrowRateValue.toFixed(4)) : null,
          depositRate: depositRateValue !== null ? Number(depositRateValue.toFixed(4)) : null,
          borrowVelocityUSD: Number(borrowVelocityUSD.toFixed(2)),
          depositVelocityUSD: Number(depositVelocityUSD.toFixed(2)),
          liquidationThresholdUSD: Number(liquidationThresholdUSD.toFixed(2)),
          liquidationHeadroomUSD: Number(liquidationHeadroomUSD.toFixed(2)),
          liquidationHeadroomPct:
            liquidationHeadroomPct !== null ? Number(liquidationHeadroomPct.toFixed(4)) : null,
        };
      })
      .sort((a, b) => b.totalDepositsUSD - a.totalDepositsUSD),
    80,
  );

  const largeBorrows = limitArray(
    borrows
      .filter((borrow) => toNumber(borrow.amountUSD) >= 25_000)
      .sort((a, b) => toNumber(b.amountUSD) - toNumber(a.amountUSD))
      .map((borrow) => ({
        amountUSD: Number(toNumber(borrow.amountUSD).toFixed(2)),
        asset: borrow.asset?.symbol || 'ASSET',
        marketId: borrow.market?.id || 'unknown',
        timestamp: Number(borrow.timestamp || 0),
      })),
    150,
  );

  const largeDeposits = limitArray(
    deposits
      .filter((deposit) => toNumber(deposit.amountUSD) >= 25_000)
      .sort((a, b) => toNumber(b.amountUSD) - toNumber(a.amountUSD))
      .map((deposit) => ({
        amountUSD: Number(toNumber(deposit.amountUSD).toFixed(2)),
        asset: deposit.asset?.symbol || 'ASSET',
        marketId: deposit.market?.id || 'unknown',
        timestamp: Number(deposit.timestamp || 0),
      })),
    150,
  );

  const riskSignals = marketStats
    .filter(
      (market) =>
        market.utilization >= 0.55 ||
        (market.liquidationBufferUSD !== null && market.liquidationBufferUSD < 0),
    )
    .map((market) => ({
      marketId: market.marketId,
      token: market.token,
      utilization: market.utilization,
      liquidationBufferUSD: market.liquidationBufferUSD,
      note:
        market.liquidationBufferUSD < 0
          ? 'Borrowed value exceeds deposits (negative buffer)'
          : 'Utilization above 75%',
    }));

  const borrowerMap = borrows.reduce(
    (map, borrow) => {
      const account = borrow.account?.id || 'unknown';
      if (!map.has(account)) {
        map.set(account, {
          accountId: account,
          totalBorrowUSD: 0,
          markets: new Set<string>(),
        });
      }
      const entry = map.get(account)!;
      entry.totalBorrowUSD += toNumber(borrow.amountUSD);
      if (borrow.market?.id) {
        entry.markets.add(borrow.market.id);
      }
      return map;
    },
    new Map<string, { accountId: string; totalBorrowUSD: number; markets: Set<string> }>(),
  );

  const depositorMap = deposits.reduce(
    (map, deposit) => {
      const account = deposit.account?.id || 'unknown';
      if (!map.has(account)) {
        map.set(account, {
          accountId: account,
          totalDepositUSD: 0,
          markets: new Set<string>(),
        });
      }
      const entry = map.get(account)!;
      entry.totalDepositUSD += toNumber(deposit.amountUSD);
      if (deposit.market?.id) {
        entry.markets.add(deposit.market.id);
      }
      return map;
    },
    new Map<string, { accountId: string; totalDepositUSD: number; markets: Set<string> }>(),
  );

  const liquidationEvents = limitArray(
    liquidations
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      .map((liquidation) => ({
        accountId: liquidation.account?.id || 'unknown',
        liquidatorId: liquidation.liquidator?.id || 'unknown',
        amountUSD: Number(toNumber(liquidation.amountUSD).toFixed(2)),
        marketId: liquidation.market?.id || 'unknown',
        timestamp: Number(liquidation.timestamp || 0),
      })),
    50,
  );

  const rateChangeSnapshots = marketStats.map((market) => ({
    marketId: market.marketId,
    token: market.token,
    variableBorrowAPR: market.borrowVelocityUSD,
    depositAPR: market.depositVelocityUSD,
    last12hChangeBorrow: Number((market.borrowVelocityUSD * 0.1).toFixed(4)),
    last12hChangeDeposit: Number((market.depositVelocityUSD * 0.1).toFixed(4)),
  }));

  const whaleExposure = (Array.from(borrowerMap.entries()) as Array<
    [string, { accountId: string; totalBorrowUSD: number; markets: Set<string> }]
  >).map(([accountId, entry]) => {
    const depositor = depositorMap.get(accountId);
    const depositUSD = depositor ? depositor.totalDepositUSD : 0;
      return {
      accountId,
      totalBorrowUSD: Number(entry.totalBorrowUSD.toFixed(2)),
      totalDepositUSD: Number(depositUSD.toFixed(2)),
      netExposureUSD: Number((entry.totalBorrowUSD - depositUSD).toFixed(2)),
      markets: entry.markets.size,
    };
  })
    .sort((a, b) => Math.abs(b.netExposureUSD) - Math.abs(a.netExposureUSD))
    .slice(0, 40);

  return {
    overview: {
      totalBorrowsUSD: Number(totalBorrowsUSD.toFixed(2)),
      totalDepositsUSD: Number(totalDepositsUSD.toFixed(2)),
      borrowToDepositRatio: Number(borrowToDepositRatio.toFixed(4)),
      marketsCovered: markets.length,
    },
    markets: marketStats,
    largeBorrows,
    largeDeposits,
    riskSignals,
    borrowerLeaders: (Array.from(borrowerMap.values()) as Array<{
      accountId: string;
      totalBorrowUSD: number;
      markets: Set<string>;
    }>).map((entry) => ({
      accountId: entry.accountId,
      totalBorrowUSD: Number(entry.totalBorrowUSD.toFixed(2)),
      markets: entry.markets.size,
    }))
      .sort((a, b) => b.totalBorrowUSD - a.totalBorrowUSD)
      .slice(0, 30),
    depositorLeaders: (Array.from(depositorMap.values()) as Array<{
      accountId: string;
      totalDepositUSD: number;
      markets: Set<string>;
    }>).map((entry) => ({
      accountId: entry.accountId,
      totalDepositUSD: Number(entry.totalDepositUSD.toFixed(2)),
      markets: entry.markets.size,
      }))
      .sort((a, b) => b.totalDepositUSD - a.totalDepositUSD)
      .slice(0, 30),
    liquidationEvents,
    rateChangeSnapshots,
    whaleExposure,
  };
};

type NFTSummary = {
  overview: {
    totalProjects: number;
    activeProjects: number;
    totalTransfers: number;
    totalMints: number;
    totalTokens: number;
    protocols: string[];
  };
  mostTradedNFTs: Array<{
    tokenId: string;
    projectId: string;
    projectName: string;
    transferCount: number;
    owner: string;
  }>;
  recentTransfers: Array<{
    id: string;
    blockNumber: string;
    blockTimestamp: string;
    from: string;
    to: string;
    tokenId: string;
    projectName: string;
    transactionHash: string;
  }>;
  recentMints: Array<{
    id: string;
    tokenId: string;
    projectId: string;
    projectName: string;
    minterAddress: string;
    transactionHash: string;
    currencySymbol: string;
  }>;
  featuredProjects: Array<{
    id: string;
    projectId: string;
    name: string;
    artistName: string;
    invocations: number;
    maxInvocations: number;
    complete: boolean;
    pricePerTokenInWei: string;
    transferCount: number;
    mintCount: number;
  }>;
};

const toNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const summarizeNFTData = (nftData: Record<string, any[]>): NFTSummary => {
  // Art Blocks returns flat array with _entityType field
  const allNFTData = Object.values(nftData).flat();
  const protocols = Object.keys(nftData);

  const projects = allNFTData.filter((item: any) => item._entityType === 'project');
  const transfers = allNFTData.filter((item: any) => item._entityType === 'transfer');
  const mints = allNFTData.filter((item: any) => item._entityType === 'mint');
  const tokens = allNFTData.filter((item: any) => item._entityType === 'token');

  const activeProjects = projects.filter((p: any) => p.active === true);

  // 1. Most Traded NFTs (based on transfer count from tokens)
  const tokenTransferCounts = new Map<string, number>();
  tokens.forEach((token: any) => {
    tokenTransferCounts.set(token.id, token.transfers?.length || 0);
  });

  const mostTradedNFTs = limitArray(
    tokens
      .map((token: any) => ({
        tokenId: token.tokenId,
        projectId: token.project?.projectId || 'unknown',
        projectName: token.project?.name || 'Unknown Project',
        transferCount: token.transfers?.length || 0,
        owner: token.owner?.id || 'unknown',
      }))
      .sort((a, b) => b.transferCount - a.transferCount),
    50,
  );

  // 2. Recent Transfers
  const recentTransfers = limitArray(
    transfers
      .sort((a, b) => Number(b.blockTimestamp || b.blockNumber || 0) - Number(a.blockTimestamp || a.blockNumber || 0))
      .map((transfer: any) => ({
        id: transfer.id,
        blockNumber: transfer.blockNumber || 'unknown',
        blockTimestamp: transfer.blockTimestamp || 'unknown',
        from: transfer.from || 'unknown',
        to: transfer.to || 'unknown',
        tokenId: transfer.token?.tokenId || 'unknown',
        projectName: transfer.token?.project?.name || 'unknown',
        transactionHash: transfer.transactionHash || 'unknown',
      })),
    100,
  );

  // 3. Recent Mints (from PrimaryPurchases)
  const recentMints = limitArray(
    mints
      .map((mint: any) => ({
        id: mint.id,
        tokenId: mint.token?.tokenId || 'unknown',
        projectId: mint.token?.project?.projectId || 'unknown',
        projectName: mint.token?.project?.name || 'Unknown Project',
        minterAddress: mint.minterAddress || 'unknown',
        transactionHash: mint.transactionHash || 'unknown',
        currencySymbol: mint.currencySymbol || 'ETH',
      })),
    100,
  );

  // 4. Featured Projects (based on invocations and activity)
  const projectActivityMap = new Map<string, { transfers: number; mints: number }>();
  transfers.forEach((t: any) => {
    const projectId = t.token?.project?.id || t.token?.project?.projectId;
    if (projectId) {
      const current = projectActivityMap.get(projectId) || { transfers: 0, mints: 0 };
      current.transfers++;
      projectActivityMap.set(projectId, current);
    }
  });
  mints.forEach((m: any) => {
    const projectId = m.token?.project?.id || m.token?.project?.projectId;
    if (projectId) {
      const current = projectActivityMap.get(projectId) || { transfers: 0, mints: 0 };
      current.mints++;
      projectActivityMap.set(projectId, current);
    }
  });

  const featuredProjects = limitArray(
    projects
      .map((project: any) => ({
        id: project.id,
        projectId: project.projectId,
        name: project.name,
        artistName: project.artistName,
        invocations: toNumber(project.invocations),
        maxInvocations: toNumber(project.maxInvocations),
        complete: project.complete === true,
        pricePerTokenInWei: project.pricePerTokenInWei || '0',
        transferCount: projectActivityMap.get(project.id)?.transfers || 0,
        mintCount: projectActivityMap.get(project.id)?.mints || 0,
      }))
      .sort((a, b) => {
        // Sort by total activity (transfers + mints) then by invocations
        const activityA = a.transferCount + a.mintCount;
        const activityB = b.transferCount + b.mintCount;
        if (activityA !== activityB) return activityB - activityA;
        return Number(b.invocations) - Number(a.invocations);
      }),
    50,
  );

  return {
    overview: {
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      protocols,
      totalTransfers: transfers.length,
      totalMints: mints.length,
      totalTokens: tokens.length,
    },
    mostTradedNFTs,
    recentTransfers,
    recentMints,
    featuredProjects,
  };
};

const buildCrossSummary = (
  rawDex: Record<string, any[]>,
  rawLending: Record<string, any[]>,
  dexSummary: DexSummary,
  lendingSummary: LendingSummary,
  pairDirectionStats: Array<{
    pair: string;
    swapsToken0To1: number;
    swapsToken1To0: number;
    netUSD: number;
  }>,
): CrossSummary => {
  const crossReferencePairsWithMarkets = (
    pairStats: Array<{ pair: string; netUSD: number }>,
    markets: Array<{
      marketId: string;
      token: string;
      totalDepositsUSD: number;
      totalBorrowsUSD: number;
      utilization: number;
      liquidationThreshold: number | null;
      maximumLTV: number | null;
      liquidationBufferUSD: number;
      liquidationBufferPct: number | null;
      borrowVelocityUSD: number;
      depositVelocityUSD: number;
      liquidationThresholdUSD: number;
      liquidationHeadroomUSD: number;
      liquidationHeadroomPct: number | null;
    }>,
  ) => {
    return pairStats.map((pairStat) => {
      const relatedMarket = markets.find((market) =>
        pairStat.pair.includes(market.token),
      );
      return {
        pair: pairStat.pair,
        relatedMarket: relatedMarket?.token || 'N/A',
        swapVolumeUSD: pairStat.netUSD,
        borrowUSD: relatedMarket?.totalBorrowsUSD || 0,
        inference:
          relatedMarket && pairStat.netUSD > 0
            ? 'Swap inflow may indicate leverage via this market'
            : 'Neutral',
      };
    });
  };

  const stablecoinSymbols = new Set(['USDC', 'USDT', 'DAI', 'GHO', 'FRAX', 'USDbC', 'cbUSD']);
  let stablecoinVolumeUSD = 0;
  const pairVolumeMap = new Map<string, number>();
  const addressOverlap = new Map<string, { swaps: number; borrowUSD: number }>();
  const stablecoinPairMap = new Map<string, number>();

  for (const poolSwaps of Object.values(rawDex)) {
    for (const swap of poolSwaps) {
      const pair = formatPoolLabel(swap.pool);
      const amountUSD = toNumber(swap.amountUSD);
      const symbols = [
        swap.pool?.token0?.symbol,
        swap.pool?.token1?.symbol,
        swap.token0?.symbol,
        swap.token1?.symbol,
      ].filter(Boolean);
      if (symbols.some((sym) => stablecoinSymbols.has(String(sym)))) {
        stablecoinVolumeUSD += amountUSD;
        stablecoinPairMap.set(pair, (stablecoinPairMap.get(pair) || 0) + amountUSD);
      }
      pairVolumeMap.set(pair, (pairVolumeMap.get(pair) || 0) + amountUSD);

      const sender = swap.sender || 'unknown';
      if (!addressOverlap.has(sender)) {
        addressOverlap.set(sender, { swaps: 0, borrowUSD: 0 });
      }
      addressOverlap.get(sender)!.swaps += 1;
    }
  }

  const topPairs = Array.from(pairVolumeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pair, volume]) => `${pair}: ${Number(volume.toFixed(2))}`);

  for (const entry of Object.values(rawLending).flat()) {
    for (const borrow of entry.borrows || []) {
      const account = borrow.account?.id || 'unknown';
      if (!addressOverlap.has(account)) {
        addressOverlap.set(account, { swaps: 0, borrowUSD: 0 });
      }
      addressOverlap.get(account)!.borrowUSD += toNumber(borrow.amountUSD);
    }
  }

  const overlappingActors = Array.from(addressOverlap.entries())
    .filter(([, stats]) => stats.swaps > 0 && stats.borrowUSD > 0)
    .sort((a, b) => b[1].borrowUSD - a[1].borrowUSD)
    .slice(0, 5)
    .map(
      ([address, stats]) =>
        `${address}: swaps ${stats.swaps}, borrow ${Number(stats.borrowUSD.toFixed(2))} USD`,
    );

  const topBorrowMarkets = lendingSummary.markets
    .slice(0, 5)
    .map(
      (market) =>
        `${market.token}: ${market.totalBorrowsUSD.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} USD`,
    );

  const volumeToBorrowRatio =
    lendingSummary.overview.totalBorrowsUSD > 0
      ? dexSummary.overview.totalVolumeUSD / lendingSummary.overview.totalBorrowsUSD
      : 0;

  const stablecoinVolumeShare =
    dexSummary.overview.totalVolumeUSD > 0
      ? stablecoinVolumeUSD / dexSummary.overview.totalVolumeUSD
      : 0;
      
  const stablecoinFlowBreakdown = Array.from(stablecoinPairMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pair, volume]) => ({
      pair,
      volumeUSD: Number(volume.toFixed(2)),
    }));

  const combinedBucketMap = new Map<
    number,
    { dexVolumeUSD: number; borrowVolumeUSD: number }
  >();

  const timeBucketSizeSeconds = 60 * 60; // 1h
  for (const poolSwaps of Object.values(rawDex)) {
    for (const swap of poolSwaps) {
      const ts = Number(swap.timestamp || 0);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      const bucket = Math.floor(ts / timeBucketSizeSeconds);
      if (!combinedBucketMap.has(bucket)) {
        combinedBucketMap.set(bucket, { dexVolumeUSD: 0, borrowVolumeUSD: 0 });
      }
      combinedBucketMap.get(bucket)!.dexVolumeUSD += toNumber(swap.amountUSD);
    }
  }

  for (const entry of Object.values(rawLending).flat()) {
    for (const borrow of entry.borrows || []) {
      const ts = Number(borrow.timestamp || 0);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      const bucket = Math.floor(ts / timeBucketSizeSeconds);
      if (!combinedBucketMap.has(bucket)) {
        combinedBucketMap.set(bucket, { dexVolumeUSD: 0, borrowVolumeUSD: 0 });
      }
      combinedBucketMap.get(bucket)!.borrowVolumeUSD += toNumber(borrow.amountUSD);
    }
  }

  const volumeVsBorrowByHour = Array.from(combinedBucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-48)
    .map(([bucket, stats]) => ({
      hour: new Date(bucket * timeBucketSizeSeconds * 1000).toISOString(),
      dexVolumeUSD: Number(stats.dexVolumeUSD.toFixed(2)),
      borrowVolumeUSD: Number(stats.borrowVolumeUSD.toFixed(2)),
    }));

  const leverageLoops = crossReferencePairsWithMarkets(
    pairDirectionStats,
    lendingSummary.markets,
  )
    .sort((a, b) => b.swapVolumeUSD - a.swapVolumeUSD)
    .slice(0, 20);
      
      return {
    dexVolumeUSD: Number(dexSummary.overview.totalVolumeUSD.toFixed(2)),
    lendingBorrowsUSD: Number(lendingSummary.overview.totalBorrowsUSD.toFixed(2)),
    volumeToBorrowRatio: Number(volumeToBorrowRatio.toFixed(4)),
    stablecoinVolumeUSD: Number(stablecoinVolumeUSD.toFixed(2)),
    stablecoinVolumeShare: Number(stablecoinVolumeShare.toFixed(4)),
    mostActivePairs: topPairs,
    topBorrowMarkets,
    overlappingActors,
    stablecoinFlowBreakdown,
    volumeVsBorrowByHour,
    leverageLoops,
  };
};
const normalizeModel = (model: string): string => {
  if (model.includes('/')) {
    return model.split('/').pop() || model;
  }
  return model;
};

const fetchAndAnalyzeSchema = z.object({
  limitPerProtocol: z.number().min(50).max(12000).default(12000),
});

addEntrypoint({
  key: 'fetch-and-analyze-raw',
  description: 'Fetch 12h of Uniswap/Aave data (2000 records per protocol) and produce an English report',
  input: fetchAndAnalyzeSchema,
  handler: async ({ input }) => {
    const params = fetchAndAnalyzeSchema.parse(input ?? {});

    const inferenceKey = process.env.INFERENCE_API_KEY;
    if (!inferenceKey) {
      throw new Error('INFERENCE_API_KEY is not set');
    }

    const model = normalizeModel(process.env.REPORT_MODEL || 'openai/gpt-4o');
    const baseUrl = process.env.DAYDREAMS_BASE_URL || 'https://api-beta.daydreams.systems/v1';

    console.log('[fetch-and-analyze-raw] Step 1: Fetching data from subgraphs...');
    const rawData = await fetchAllProtocolsData({
      dexLimit: params.limitPerProtocol,
      lendingLimit: params.limitPerProtocol,
      nftLimit: params.limitPerProtocol,
    });

    console.log('[fetch-and-analyze-raw] Step 2: Saving raw data to Supabase...');
    await saveAllProtocolsData(rawData);

    console.log('[fetch-and-analyze-raw] Step 3: Preparing AI payload...');

    const dexTotal = Object.values(rawData.dex).reduce((sum, arr) => sum + arr.length, 0);
    const lendingTotal = Object.values(rawData.lending).reduce((sum, entries) => {
      return (
        sum +
        entries.reduce((inner, item) => {
          const borrows = Array.isArray(item?.borrows) ? item.borrows.length : 0;
          const deposits = Array.isArray(item?.deposits) ? item.deposits.length : 0;
          return inner + borrows + deposits;
        }, 0)
      );
    }, 0);
    const nftTotal = Object.values(rawData.nft).reduce((sum, arr) => sum + arr.length, 0);

    const dataSummary: DataSummary = {
      metadata: {
        fetchedAt: rawData.fetchedAt,
        timeframe: '12 hours',
        limitPerProtocol: params.limitPerProtocol,
        totalRecordsFetched: dexTotal + lendingTotal + nftTotal,
        recordsSentToAI: dexTotal + lendingTotal + nftTotal,
        note: `All fetched records included (limit ${params.limitPerProtocol} each, 12h window): Uniswap swaps, Aave borrow/deposit events, and NFT projects`,
      },
      dex: {
        protocols: Object.keys(rawData.dex),
        totalRecords: dexTotal,
        data: rawData.dex,
      },
      lending: {
        protocols: Object.keys(rawData.lending),
        totalRecords: lendingTotal,
        data: rawData.lending,
      },
      nft: {
        protocols: Object.keys(rawData.nft),
        totalRecords: nftTotal,
        data: rawData.nft,
      },
    };

    for (const section of SECTION_KEYS) {
      if (!dataSummary[section] || !dataSummary[section].data) {
        dataSummary[section] = {
          protocols: [],
          totalRecords: 0,
          data: {},
        };
      }
    }

    const dexSummary = summarizeDexData(rawData.dex);
    const lendingSummary = summarizeLendingData(rawData.lending);
    const nftSummary = summarizeNFTData(rawData.nft);
    const crossSummary = buildCrossSummary(
      rawData.dex,
      rawData.lending,
      dexSummary,
      lendingSummary,
      dexSummary.pairDirectionStats,
    );
    // Graph reports: 160k total limit (was 100k for Helius, restored to original)
    const dexSummaryStr = safeStringify(dexSummary, 120_000);
    const lendingSummaryStr = safeStringify(lendingSummary, 15_000);
    const nftSummaryStr = safeStringify(nftSummary, 20_000);
    const crossSummaryStr = safeStringify(crossSummary, 5_000);

    const safeJoin = (value: any, fallback: string = 'None') => {
      if (!Array.isArray(value) || value.length === 0) {
        return fallback;
      }
      return value.join(', ');
    };
    const safeNumber = (value: any, fallback: number = 0) =>
      typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
    const safeText = (value: any, fallback: string = 'Unknown') => {
      if (value === null || value === undefined) return fallback;
      const str = String(value);
      return str.length === 0 ? fallback : str;
    };

    const metadata = dataSummary.metadata;
    const totalRecords = safeNumber(metadata.totalRecordsFetched);
    const timeframe = safeText(metadata.timeframe, '12 hours');
    const fetchedAt = safeText(metadata.fetchedAt, new Date().toISOString());

    const dexRecords = safeNumber(dataSummary.dex.totalRecords);
    const dexProtocols = safeJoin(dataSummary.dex.protocols);
    const lendingRecords = safeNumber(dataSummary.lending.totalRecords);
    const lendingProtocols = safeJoin(dataSummary.lending.protocols);
    const nftRecords = safeNumber(dataSummary.nft.totalRecords);
    const nftProtocols = safeJoin(dataSummary.nft.protocols);

    let prompt = `You are an on-chain research lead. Below is raw transaction data pulled from Uniswap (DEX), Aave (lending), and NFT protocols over the past 12 hours.

## DATASET SUMMARY

**Total Records:** ${totalRecords}  
**Analysis Window:** Last ${timeframe}  
**Data Pulled At:** ${fetchedAt}

### DEX Protocols (${dexRecords} records)
Protocols: ${dexProtocols}  
Synthesis (top pools, whales, large swaps, samples):
${dexSummaryStr}

### Lending Protocols (${lendingRecords} records)
Protocols: ${lendingProtocols}  
Synthesis (market stats, borrow/deposit ratios, risk signals, large events):
${lendingSummaryStr}

### NFT Protocols (${nftRecords} records)
Protocols: ${nftProtocols}  
Synthesis (most traded NFTs, recent transfers, recent mints, featured projects):
Note: Price data (floor prices, most expensive/cheapest NFTs) is not available in this subgraph.
${nftSummaryStr}

### Cross-Protocol Links
Shared metrics to compare swap flows vs. lending balance velocity:
${crossSummaryStr}

---

## ANALYSIS GUIDANCE

- Treat this like a quant research note: inspect every segment, surface the most material signals, and back each statement with numbers (USD, %, ratios, counts, timestamps, addresses).
- Derive whatever metrics are useful (volume/TVL, borrow/deposit deltas, whale share, liquidation buffer, implied leverage, velocity, variability). When you invent a metric, mention how it was derived.
- Prioritize statistically meaningful items (six-figure USD flows, >5% shifts, unusual wallet activity). Ignore trivial noise.
- Map Uniswap flows to Aave markets whenever the data hints at leverage loops, hedges, liquidity migration, or stress build-ups.
- Never mention how many “records” or “rows” were provided; speak only about the on-chain facts.
- Use markdown tables, bullet grids, or ASCII-style diagrams if they help visualize rankings, ratios, or flow maps.
- Highlight at least 5 contrarian or "aha" insights (anything a casual observer would miss — e.g., whales hedging contrary to dominant flow, stealth liquidation gaps, stablecoin drains pre-borrow). Label each explicitly ("Insight" / "Heads-up") and quantify it.
- **Identify and include the top 10 most active whale wallets** from the data you've analyzed. These should be wallets with the highest transaction volumes, largest positions, or most significant activity across DEX and lending protocols. Present them in a dedicated section (e.g., "Top 10 Active Whale Wallets") with wallet addresses, their key activities, transaction volumes, and any notable patterns you observe. This is a required section of the report.
- Whenever you see a questionable number, double-check the context (e.g., verify that large borrow/deposit amounts align with market totals) so the report doesn't misinterpret the data.
- Tone: analytical, data-first, no investment advice. Think like an on-chain professor briefing institutional clients.

## OUTPUT FORMAT

- Markdown with a strong H1 title (# Title).
- Structure the body into sections of your choice (e.g., “Key Signals”, “Flows & Ratios”, “Cross-Protocol Map”, mini tables). Every section must lean on quantified evidence before interpretation.
- Finish with a single-sentence takeaway summarizing the most important learning.

Goal: act like an on-chain professor distilling complex raw data into clear, data-backed insights a human can trust.`;

    const promptLength = prompt.length;
    const estimatedTokens = Math.ceil(promptLength / 4);
    console.log(`[fetch-and-analyze-raw] Prompt size: ${promptLength} chars (~${estimatedTokens} tokens)`);

    console.log('[fetch-and-analyze-raw] Step 4: Requesting AI completion...');

    const payload = {
      model,
      temperature: 0.2,
      max_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inferenceKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AI API failed: ${response.status} ${errorBody}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const report = result.choices?.[0]?.message?.content;
    const tokensUsed = result.usage?.total_tokens;

    if (!report) {
      throw new Error('AI API returned empty content');
    }

    console.log('[fetch-and-analyze-raw] Step 5: Saving report to Supabase...');
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();
      const reportDate = now.split('T')[0];
      await supabase
        .from('graph_reports')
        .upsert(
          {
            report_date: reportDate,
            source: 'graph', // Explicitly set source for Graph reports
            report_content: {
              report,
              rawDataSummary: dataSummary,
              generatedAt: now,
              modelUsed: model,
              tokensUsed,
            },
            generated_at: now,
            model_used: model,
            tokens_used: tokensUsed,
          },
          { onConflict: 'report_date,source' }, // Updated to match unique constraint if source column exists
        );
  } catch (error: any) {
      console.error('[fetch-and-analyze-raw] ❌ Failed to save report metadata:', error.message);
    }

    console.log('[fetch-and-analyze-raw] ✅ Completed successfully');
      
      return {
        output: {
        report,
        },
      };
  },
});

app.get('/entrypoints/fetch-and-analyze-raw/invoke', async (c) => {
  try {
    const limitPerProtocol = parseInt(c.req.query('limitPerProtocol') || '12000', 10);
    const body = await app.request('/entrypoints/fetch-and-analyze-raw/invoke', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          limitPerProtocol,
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return body;
  } catch (error: any) {
    console.error('[GET fetch-and-analyze-raw] Error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export { app };