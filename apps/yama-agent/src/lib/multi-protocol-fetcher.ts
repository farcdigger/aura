import { getGraphClient } from './graphClient';
import { getSubgraphsByType, type SubgraphConfig } from './subgraph-config';

type FetchOptions = {
  dexLimit?: number;
  lendingLimit?: number;
};

export type FetchAllProtocolsResult = {
  fetchedAt: string;
  dex: Record<string, any[]>;
  lending: Record<string, any[]>;
};

const DEFAULT_LIMIT = 12000;
const BATCH_SIZE = 1000;

function getTimestampHoursAgo(hours: number): string {
  const now = Math.floor(Date.now() / 1000);
  return String(now - hours * 60 * 60);
}

export function get12HoursAgoTimestamp(): string {
  return getTimestampHoursAgo(12);
}

async function fetchWithPagination(
  client: ReturnType<typeof getGraphClient>,
  buildQuery: (first: number, skip: number) => string,
  limit: number,
): Promise<any[]> {
  const records: any[] = [];
        let skip = 0;
        
  while (records.length < limit) {
    const batchSize = Math.min(BATCH_SIZE, limit - records.length);
    const query = buildQuery(batchSize, skip);
    const response = await client.request(query);
    const firstKey = Object.keys(response)[0];
    const chunk = (response[firstKey] || []) as any[];
    records.push(...chunk);
    if (chunk.length < batchSize) {
      break;
    }
    skip += chunk.length;
  }

  return records;
  }

export async function fetchDEXSwaps(subgraphConfig: SubgraphConfig, limit: number = DEFAULT_LIMIT): Promise<any[]> {
  const client = getGraphClient(subgraphConfig);
  const timestamp = get12HoursAgoTimestamp();
  
  console.log(`[MultiFetcher] Fetching DEX swaps from ${subgraphConfig.name}`);

  const swaps = await fetchWithPagination(
    client,
    (first, skip) => `{
      swaps(
        first: ${first},
        skip: ${skip},
        orderBy: timestamp,
        orderDirection: desc,
        where: { timestamp_gte: ${timestamp} }
            ) {
              id
              timestamp
        amount0
        amount1
        amountUSD
        sender
        recipient
        sqrtPriceX96
        tick
        pool {
          id
          feeTier
          token0 { id symbol name decimals }
          token1 { id symbol name decimals }
        }
        token0 { id symbol name }
        token1 { id symbol name }
      }
    }`,
    limit,
  );

  console.log(`[MultiFetcher] ✅ ${swaps.length} swaps fetched from ${subgraphConfig.name}`);
          
  return swaps.map((swap) => ({
    ...swap,
            _protocol: subgraphConfig.protocol,
            _network: subgraphConfig.network,
            _subgraphName: subgraphConfig.name,
    _entityType: 'swap',
  }));
}

async function fetchMarkets(client: ReturnType<typeof getGraphClient>): Promise<any[]> {
  const query = `{
    markets(
      first: 50,
              orderBy: totalValueLockedUSD, 
              orderDirection: desc
            ) {
              id
              name
      isActive
      canBorrowFrom
      canUseAsCollateral
      maximumLTV
      liquidationThreshold
      liquidationPenalty
              totalValueLockedUSD
      totalDepositBalanceUSD
      totalBorrowBalanceUSD
      cumulativeBorrowUSD
      cumulativeLiquidateUSD
      inputToken {
              id
        symbol
        name
      }
      rates {
        side
        type
        rate
            }
    }
  }`;
  const response = await client.request(query);
  return response.markets || [];
}

async function fetchLendingEvents(
  client: ReturnType<typeof getGraphClient>,
  entity: 'borrows' | 'deposits',
  limit: number,
  timestamp: string,
): Promise<any[]> {
  const rows = await fetchWithPagination(
    client,
    (first, skip) => `{
      ${entity}(
        first: ${first},
        skip: ${skip},
            orderBy: timestamp, 
        orderDirection: desc,
        where: { timestamp_gte: ${timestamp} }
          ) {
            id
            timestamp
        amount
        amountUSD
        account { id }
        market { id name }
        asset { id symbol name }
            }
         }`,
    limit,
    );
    
  return rows.map((row) => ({
    ...row,
    _eventType: entity === 'borrows' ? 'borrow' : 'deposit',
  }));
  }

export async function fetchLendingData(subgraphConfig: SubgraphConfig, limit: number = DEFAULT_LIMIT): Promise<any[]> {
  const client = getGraphClient(subgraphConfig);
  const timestamp = get12HoursAgoTimestamp();

  console.log(`[MultiFetcher] Fetching lending data from ${subgraphConfig.name}`);
    
  const [markets, borrows, deposits] = await Promise.all([
    fetchMarkets(client),
    fetchLendingEvents(client, 'borrows', limit, timestamp),
    fetchLendingEvents(client, 'deposits', limit, timestamp),
  ]);

  console.log(
    `[MultiFetcher] ✅ ${borrows.length} borrows, ${deposits.length} deposits from ${subgraphConfig.name}`,
  );

  return [
    {
      markets: markets.map((market: any) => ({
        ...market,
        _protocol: subgraphConfig.protocol,
        _network: subgraphConfig.network,
      })),
      borrows: borrows.map((item: any) => ({
        ...item,
        _protocol: subgraphConfig.protocol,
        _network: subgraphConfig.network,
      })),
      deposits: deposits.map((item: any) => ({
            ...item,
        _protocol: subgraphConfig.protocol,
        _network: subgraphConfig.network,
      })),
            _protocol: subgraphConfig.protocol,
            _network: subgraphConfig.network,
            _subgraphName: subgraphConfig.name,
    },
  ];
}

export async function fetchAllProtocolsData(options: FetchOptions = {}): Promise<FetchAllProtocolsResult> {
  const {
    dexLimit = DEFAULT_LIMIT,
    lendingLimit = DEFAULT_LIMIT,
  } = options;
  
  const fetchedAt = new Date().toISOString();
  const result: FetchAllProtocolsResult = {
    fetchedAt,
    dex: {},
    lending: {},
  };
  
  const dexSubgraphs = getSubgraphsByType('dex');
  for (const subgraph of dexSubgraphs) {
    try {
      result.dex[subgraph.protocol] = await fetchDEXSwaps(subgraph, dexLimit);
    } catch (error: any) {
      console.error(`[MultiFetcher] ❌ Failed to fetch DEX data from ${subgraph.name}:`, error.message);
      result.dex[subgraph.protocol] = [];
    }
  }
  
  const lendingSubgraphs = getSubgraphsByType('lending');
  for (const subgraph of lendingSubgraphs) {
    try {
      result.lending[subgraph.protocol] = await fetchLendingData(subgraph, lendingLimit);
    } catch (error: any) {
      console.error(`[MultiFetcher] ❌ Failed to fetch lending data from ${subgraph.name}:`, error.message);
      result.lending[subgraph.protocol] = [];
    }
  }

  const totalDex = Object.values(result.dex).reduce((sum, pools) => sum + pools.length, 0);
  const totalLending = Object.values(result.lending).reduce((sum, entries) => {
    return (
      sum +
      entries.reduce((inner, item) => {
        const borrows = Array.isArray(item?.borrows) ? item.borrows.length : 0;
        const deposits = Array.isArray(item?.deposits) ? item.deposits.length : 0;
        return inner + borrows + deposits;
      }, 0)
    );
  }, 0);
  
  console.log('[MultiFetcher] ✅ Fetch complete');
  console.log(`  - DEX swaps: ${totalDex}`);
  console.log(`  - Lending events: ${totalLending}`);
  
  return result;
}
