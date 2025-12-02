import { getGraphClient } from './graphClient';
import { getSubgraphsByType, type SubgraphConfig } from './subgraph-config';

type FetchOptions = {
  dexLimit?: number;
  lendingLimit?: number;
  nftLimit?: number;
};

export type FetchAllProtocolsResult = {
  fetchedAt: string;
  dex: Record<string, any[]>;
  lending: Record<string, any[]>;
  nft: Record<string, any[]>;
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
  subgraphConfig?: SubgraphConfig,
): Promise<any[]> {
  // For Aave V3 Optimism, the market/asset/account relationships may be null
  // We'll query without nested relationships and handle nulls gracefully
  const isAaveV3Optimism = subgraphConfig?.id === '3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi';
  
  let rows: any[] = [];
  
  if (isAaveV3Optimism) {
    // For Aave V3 Optimism, query without nested relationships to avoid null errors
    // We'll get market/asset info from the markets query instead
    try {
      rows = await fetchWithPagination(
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
          }
        }`,
        limit,
      );
    } catch (error: any) {
      console.error(`[MultiFetcher] ⚠️ Error fetching ${entity} for Aave V3 Optimism:`, error.message);
      // Return empty array if query fails
      return [];
    }
  } else {
    // For other subgraphs, use the full query with relationships
    rows = await fetchWithPagination(
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
  }
    
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
    fetchLendingEvents(client, 'borrows', limit, timestamp, subgraphConfig),
    fetchLendingEvents(client, 'deposits', limit, timestamp, subgraphConfig),
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

export async function fetchNFTData(subgraphConfig: SubgraphConfig, limit: number = DEFAULT_LIMIT): Promise<any[]> {
  const client = getGraphClient(subgraphConfig);
  
  console.log(`[MultiFetcher] Fetching NFT data from ${subgraphConfig.name}`);

  // Art Blocks specific query - fetch comprehensive NFT data
  if (subgraphConfig.protocol === 'art-blocks') {
    try {
      // Use timestamp for last 12 hours (blockTimestamp works in Art Blocks)
      const timestamp12HoursAgo = get12HoursAgoTimestamp();

      // Fetch projects (all active projects, ordered by invocations)
      const projects = await fetchWithPagination(
        client,
        (first, skip) => `{
          projects(
            first: ${first},
            skip: ${skip},
            orderBy: invocations,
            orderDirection: desc,
            where: { active: true }
          ) {
            id
            projectId
            name
            artistName
            active
            invocations
            maxInvocations
            complete
            pricePerTokenInWei
            currencySymbol
            currencyAddress
            additionalPayee
            createdAt
          }
        }`,
        Math.min(limit, 500), // Limit projects to 500
      );

      // Fetch transfers (recent transfers - using blockTimestamp filter which works!)
      const transfers = await fetchWithPagination(
        client,
        (first, skip) => `{
          transfers(
            first: ${first},
            skip: ${skip},
            orderBy: blockTimestamp,
            orderDirection: desc,
            where: { blockTimestamp_gte: "${timestamp12HoursAgo}" }
          ) {
            id
            blockNumber
            blockTimestamp
            from
            to
            transactionHash
            token {
              id
              tokenId
              project {
                id
                projectId
                name
              }
            }
          }
        }`,
        limit,
      );

      // Fetch tokens with transfers relation (to calculate most traded NFTs)
      // We'll fetch a large sample and calculate transfer counts in code
      const tokens = await fetchWithPagination(
        client,
        (first, skip) => `{
          tokens(
            first: ${first},
            skip: ${skip}
          ) {
            id
            tokenId
            project {
              id
              projectId
              name
            }
            owner {
              id
            }
            transfers {
              id
            }
          }
        }`,
        Math.min(limit, 2000), // Fetch more tokens to find most traded ones
      );

      // Fetch PrimaryPurchase for mint information
      // Note: PrimaryPurchase doesn't have blockNumber or timestamp, so we fetch recent ones
      let primaryPurchases: any[] = [];
      try {
        primaryPurchases = await fetchWithPagination(
          client,
          (first, skip) => `{
            primaryPurchases(
              first: ${first},
              skip: ${skip},
              orderBy: transactionHash,
              orderDirection: desc
            ) {
              id
              token {
                id
                tokenId
                project {
                  id
                  projectId
                  name
                }
              }
              minterAddress
              transactionHash
              currencyAddress
              currencySymbol
              currencyDecimals
            }
          }`,
          Math.min(limit, 1000),
        );
      } catch (mintError: any) {
        console.log(`[MultiFetcher] ⚠️ PrimaryPurchase query not available: ${mintError.message}`);
      }

      console.log(`[MultiFetcher] ✅ Art Blocks data fetched:`);
      console.log(`  - Projects: ${projects.length}`);
      console.log(`  - Transfers (recent): ${transfers.length}`);
      console.log(`  - Tokens: ${tokens.length}`);
      console.log(`  - PrimaryPurchases: ${primaryPurchases.length}`);

      // Return flat array with all entities (agent.ts expects flat array per protocol)
      return [
        ...projects.map((item: any) => ({ ...item, _entityType: 'project' })),
        ...transfers.map((item: any) => ({ ...item, _entityType: 'transfer' })),
        ...tokens.map((item: any) => ({ ...item, _entityType: 'token' })),
        ...primaryPurchases.map((item: any) => ({ ...item, _entityType: 'mint' })),
      ].map((item: any) => ({
        ...item,
        _protocol: subgraphConfig.protocol,
        _network: subgraphConfig.network,
        _subgraphName: subgraphConfig.name,
      }));
    } catch (error: any) {
      console.error(`[MultiFetcher] ❌ Error fetching Art Blocks data:`, error.message);
      // Try to fetch at least projects if other queries fail
      try {
        const projects = await fetchWithPagination(
          client,
          (first, skip) => `{
            projects(
              first: ${first},
              skip: ${skip},
              orderBy: projectId,
              orderDirection: asc,
              where: { active: true }
            ) {
              id
              projectId
              active
              additionalPayee
            }
          }`,
          Math.min(limit, 500),
        );
        console.log(`[MultiFetcher] ⚠️ Fallback: ${projects.length} projects fetched`);
        return projects.map((item: any) => ({
          ...item,
          _entityType: 'project',
          _protocol: subgraphConfig.protocol,
          _network: subgraphConfig.network,
          _subgraphName: subgraphConfig.name,
        }));
      } catch (fallbackError: any) {
        console.error(`[MultiFetcher] ❌ Fallback also failed:`, fallbackError.message);
        return [];
      }
    }
  }

  // Default empty array for other NFT protocols
  return [];
}

export async function fetchAllProtocolsData(options: FetchOptions = {}): Promise<FetchAllProtocolsResult> {
  const {
    dexLimit = DEFAULT_LIMIT,
    lendingLimit = DEFAULT_LIMIT,
    nftLimit = DEFAULT_LIMIT,
  } = options;
  
  const fetchedAt = new Date().toISOString();
  const result: FetchAllProtocolsResult = {
    fetchedAt,
    dex: {},
    lending: {},
    nft: {},
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

  const nftSubgraphs = getSubgraphsByType('nft');
  for (const subgraph of nftSubgraphs) {
    try {
      result.nft[subgraph.protocol] = await fetchNFTData(subgraph, nftLimit);
    } catch (error: any) {
      console.error(`[MultiFetcher] ❌ Failed to fetch NFT data from ${subgraph.name}:`, error.message);
      result.nft[subgraph.protocol] = [];
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
  const totalNft = Object.values(result.nft).reduce((sum, items) => sum + items.length, 0);
  
  console.log('[MultiFetcher] ✅ Fetch complete');
  console.log(`  - DEX swaps: ${totalDex}`);
  console.log(`  - Lending events: ${totalLending}`);
  console.log(`  - NFT records: ${totalNft}`);
  
  return result;
}
