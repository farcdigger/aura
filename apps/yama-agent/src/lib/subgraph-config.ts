export type SubgraphType = 'dex' | 'nft' | 'lending' | 'derivatives' | 'liquid-staking';

export interface SubgraphConfig {
  id: string;
  name: string;
  protocol: string;
  network: string;
  type: SubgraphType;
}

export const SUBGRAPH_CONFIGS: Record<string, SubgraphConfig> = {
  uniswapV3_mainnet: {
    id: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    name: 'Uniswap V3 Mainnet (Messari)',
    protocol: 'uniswap-v3',
    network: 'mainnet',
    type: 'dex',
  },
  // Aave V3 Base subgraph temporarily disabled due to The Graph indexer issues
  // The decentralized network indexers are not working properly
  // TODO: Re-enable when indexers are fixed or find alternative subgraph
  // aaveV3_base: {
  //   id: 'D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9',
  //   name: 'Aave V3 Base (Messari)',
  //   protocol: 'aave-v3',
  //   network: 'base',
  //   type: 'lending',
  // },
  artBlocks_mainnet: {
    id: '6bR1oVsRUUs6czNiB6W7NNenTXtVfNd5iSiwvS4QbRPB',
    name: 'Art Blocks Mainnet',
    protocol: 'art-blocks',
    network: 'mainnet',
    type: 'nft',
  },
};

export function getSubgraphConfig(key: string): SubgraphConfig | undefined {
  return SUBGRAPH_CONFIGS[key];
}

export function getSubgraphsByType(type: SubgraphType): SubgraphConfig[] {
  return Object.values(SUBGRAPH_CONFIGS).filter((config) => config.type === type);
}

export function getSubgraphsByProtocol(protocol: string): SubgraphConfig[] {
  return Object.values(SUBGRAPH_CONFIGS).filter((config) => config.protocol === protocol);
}

const getDefaultHost = () => {
  if (process.env.THE_GRAPH_HOST) {
    return process.env.THE_GRAPH_HOST;
  }
  if (process.env.THE_GRAPH_API_KEY) {
    return `https://gateway.thegraph.com/api/${process.env.THE_GRAPH_API_KEY}/subgraphs/id`;
  }
  return 'https://api.thegraph.com/subgraphs/id';
};

export function getSubgraphEndpoint(subgraphConfig: SubgraphConfig): string {
  const host = getDefaultHost();
  return `${host}/${subgraphConfig.id}`;
}
