/**
 * Protocol Schema Introspection
 * Test which fields are available in each subgraph
 */

import { getGraphClient } from './graphClient';
import { SUBGRAPH_CONFIGS, type SubgraphConfig } from './subgraph-config';

/**
 * Get available top-level fields from a subgraph
 */
export async function introspectSubgraph(subgraphConfig: SubgraphConfig): Promise<string[]> {
  const client = getGraphClient(subgraphConfig);
  
  try {
    const introspection = await client.request(`
      {
        __schema {
          queryType {
            fields {
              name
              type {
                name
                kind
              }
            }
          }
        }
      }
    `);
    
    const fields = introspection.__schema.queryType.fields
      .map((f: any) => f.name)
      .filter((name: string) => !name.startsWith('__')); // Filter out introspection fields
    
    return fields;
  } catch (error: any) {
    console.error(`[Introspection] Failed to introspect ${subgraphConfig.name}:`, error.message);
    return [];
  }
}

/**
 * Test common field patterns for a subgraph
 */
export async function testCommonFields(subgraphConfig: SubgraphConfig): Promise<{
  available: string[];
  unavailable: string[];
}> {
  const client = getGraphClient(subgraphConfig);
  const commonFields = [
    'pools',
    'pairs',
    'swaps',
    'transactions',
    'orders',
    'markets',
    'tokens',
    'users',
    'positions',
    'liquidityPositions',
  ];
  
  const available: string[] = [];
  const unavailable: string[] = [];
  
  for (const field of commonFields) {
    try {
      const query = `{ ${field}(first: 1) { id } }`;
      await client.request(query);
      available.push(field);
    } catch (error: any) {
      unavailable.push(field);
    }
  }
  
  return { available, unavailable };
}

/**
 * Introspect all configured subgraphs
 */
export async function introspectAllProtocols(): Promise<void> {
  console.log('[Introspection] 🔍 Starting introspection for all protocols...\n');
  
  for (const [key, config] of Object.entries(SUBGRAPH_CONFIGS)) {
    console.log(`\n📊 ${config.name} (${config.protocol})`);
    console.log('─'.repeat(50));
    
    // Get all available fields
    const allFields = await introspectSubgraph(config);
    if (allFields.length > 0) {
      console.log(`✅ Available top-level fields (${allFields.length}):`);
      allFields.slice(0, 20).forEach(field => console.log(`   - ${field}`));
      if (allFields.length > 20) {
        console.log(`   ... and ${allFields.length - 20} more`);
      }
    }
    
    // Test common fields
    const { available, unavailable } = await testCommonFields(config);
    if (available.length > 0) {
      console.log(`\n✅ Common fields available: ${available.join(', ')}`);
    }
    if (unavailable.length > 0 && unavailable.length < 10) {
      console.log(`❌ Common fields NOT available: ${unavailable.join(', ')}`);
    }
  }
  
  console.log('\n[Introspection] ✅ Complete!\n');
}













