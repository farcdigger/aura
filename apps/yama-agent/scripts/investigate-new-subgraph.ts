/**
 * New Subgraph Investigation Script
 * 
 * This script helps investigate a new subgraph to understand:
 * - What entities and fields are available
 * - Sample data structure
 * - Whether it's suitable for our reports
 * 
 * Usage: bun run scripts/investigate-new-subgraph.ts <subgraph_id_or_url>
 */

import { GraphQLClient } from 'graphql-request';

const COMMON_ENTITY_PATTERNS = [
  // DEX patterns
  'swaps', 'pools', 'pairs', 'liquidityPools', 'liquidityPositions', 'transactions',
  // Lending patterns
  'markets', 'borrows', 'deposits', 'liquidations', 'repays', 'withdraws',
  // NFT patterns
  'collections', 'tokens', 'transfers', 'sales', 'listings', 'owners',
  // Staking patterns
  'stakes', 'unstakes', 'validators', 'delegators', 'rewards',
  // General patterns
  'users', 'accounts', 'protocols', 'assets', 'events'
];

interface IntrospectionField {
  name: string;
  type: {
    name: string | null;
    kind: string;
    ofType?: {
      name: string | null;
      kind: string;
    };
  };
  args?: Array<{
    name: string;
    type: {
      name: string | null;
      kind: string;
    };
  }>;
}

interface TypeInfo {
  name: string;
  kind: string;
  fields?: Array<{
    name: string;
    type: {
      name: string | null;
      kind: string;
      ofType?: {
        name: string | null;
        kind: string;
      };
    };
  }>;
}

/**
 * Get the subgraph URL from ID or direct URL
 */
function getSubgraphUrl(input: string): string {
  // If it's already a full URL, return it
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  
  // Check if there's a Graph API key in environment
  const apiKey = process.env.THE_GRAPH_API_KEY;
  if (apiKey) {
    return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${input}`;
  }
  
  // Fallback to public endpoint
  return `https://api.thegraph.com/subgraphs/id/${input}`;
}

/**
 * Get all available query fields from the subgraph
 */
async function getAvailableFields(client: GraphQLClient): Promise<IntrospectionField[]> {
  try {
    const result = await client.request<any>(`
      {
        __schema {
          queryType {
            fields {
              name
              type {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
              args {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    `);
    
    return result.__schema.queryType.fields.filter(
      (f: IntrospectionField) => !f.name.startsWith('__')
    );
  } catch (error: any) {
    console.error('❌ Failed to introspect schema:', error.message);
    return [];
  }
}

/**
 * Get detailed type information for an entity
 */
async function getTypeInfo(client: GraphQLClient, typeName: string): Promise<TypeInfo | null> {
  try {
    const result = await client.request<any>(`
      {
        __type(name: "${typeName}") {
          name
          kind
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `);
    
    return result.__type;
  } catch (error: any) {
    console.error(`❌ Failed to get type info for ${typeName}:`, error.message);
    return null;
  }
}

/**
 * Try to fetch sample data from an entity
 */
async function getSampleData(client: GraphQLClient, entityName: string, fields: string[]): Promise<any[]> {
  try {
    // Construct a simple query with the most common fields
    const fieldList = fields.slice(0, 10).join('\n            ');
    const query = `
      {
        ${entityName}(first: 3, orderBy: id, orderDirection: desc) {
          ${fieldList}
        }
      }
    `;
    
    const result = await client.request<any>(query);
    return result[entityName] || [];
  } catch (error: any) {
    // Try with just id field
    try {
      const query = `
        {
          ${entityName}(first: 3) {
            id
          }
        }
      `;
      const result = await client.request<any>(query);
      return result[entityName] || [];
    } catch (innerError: any) {
      return [];
    }
  }
}

/**
 * Determine the likely protocol type based on available entities
 */
function guessProtocolType(entityNames: string[]): string[] {
  const types: string[] = [];
  const entities = entityNames.map(n => n.toLowerCase());
  
  // DEX indicators
  if (entities.some(e => e.includes('swap') || e.includes('pool') || e.includes('pair'))) {
    types.push('dex');
  }
  
  // Lending indicators
  if (entities.some(e => e.includes('borrow') || e.includes('lend') || e.includes('market'))) {
    types.push('lending');
  }
  
  // NFT indicators
  if (entities.some(e => e.includes('token') && (e.includes('nft') || e.includes('collection')))) {
    types.push('nft');
  }
  if (entities.some(e => e.includes('transfer') || e.includes('sale') || e.includes('listing'))) {
    types.push('nft');
  }
  
  // Staking indicators
  if (entities.some(e => e.includes('stake') || e.includes('validator') || e.includes('delegat'))) {
    types.push('staking');
  }
  
  // Derivatives indicators
  if (entities.some(e => e.includes('position') || e.includes('order') || e.includes('future'))) {
    types.push('derivatives');
  }
  
  return [...new Set(types)];
}

/**
 * Main investigation function
 */
async function investigateSubgraph(subgraphInput: string) {
  console.log('🔍 New Subgraph Investigation Tool');
  console.log('═'.repeat(60));
  console.log(`Input: ${subgraphInput}\n`);
  
  const url = getSubgraphUrl(subgraphInput);
  console.log(`📡 Connecting to: ${url}\n`);
  
  const client = new GraphQLClient(url);
  
  // Step 1: Get all available query fields
  console.log('📊 Step 1: Discovering Available Entities...');
  console.log('─'.repeat(60));
  
  const fields = await getAvailableFields(client);
  if (fields.length === 0) {
    console.error('❌ No fields found. The subgraph might be invalid or unreachable.');
    return;
  }
  
  console.log(`✅ Found ${fields.length} top-level query fields\n`);
  
  // Step 2: Categorize fields
  const listFields = fields.filter(f => f.type.kind === 'LIST' || f.type.ofType?.kind === 'LIST');
  const singleFields = fields.filter(f => f.type.kind !== 'LIST' && f.type.ofType?.kind !== 'LIST');
  
  console.log(`📋 List Entities (${listFields.length}):`);
  listFields.forEach(f => {
    const typeName = f.type.ofType?.name || f.type.name || 'Unknown';
    console.log(`   ✓ ${f.name} → [${typeName}]`);
  });
  
  if (singleFields.length > 0) {
    console.log(`\n📄 Single Item Queries (${singleFields.length}):`);
    singleFields.slice(0, 10).forEach(f => {
      const typeName = f.type.name || 'Unknown';
      console.log(`   • ${f.name} → ${typeName}`);
    });
  }
  
  // Step 3: Guess protocol type
  console.log('\n🤔 Step 2: Protocol Type Detection...');
  console.log('─'.repeat(60));
  
  const entityNames = listFields.map(f => f.name);
  const guessedTypes = guessProtocolType(entityNames);
  
  if (guessedTypes.length > 0) {
    console.log(`✅ Likely Protocol Type(s): ${guessedTypes.join(', ')}`);
  } else {
    console.log('⚠️  Could not determine protocol type automatically');
  }
  
  // Step 4: Find common patterns
  console.log('\n🔎 Step 3: Checking Common Entity Patterns...');
  console.log('─'.repeat(60));
  
  const foundPatterns = COMMON_ENTITY_PATTERNS.filter(pattern => 
    entityNames.some(name => name.toLowerCase() === pattern.toLowerCase())
  );
  
  if (foundPatterns.length > 0) {
    console.log(`✅ Found ${foundPatterns.length} common patterns:`);
    foundPatterns.forEach(pattern => console.log(`   ✓ ${pattern}`));
  } else {
    console.log('⚠️  No common patterns found. This might be a custom subgraph.');
  }
  
  // Step 5: Investigate interesting entities
  console.log('\n📦 Step 4: Investigating Key Entities...');
  console.log('─'.repeat(60));
  
  const entitiesToInvestigate = listFields.slice(0, 5); // Top 5 entities
  
  for (const field of entitiesToInvestigate) {
    const typeName = field.type.ofType?.name || field.type.name;
    if (!typeName) continue;
    
    console.log(`\n🔍 Entity: ${field.name} (Type: ${typeName})`);
    
    // Get type information
    const typeInfo = await getTypeInfo(client, typeName);
    if (!typeInfo || !typeInfo.fields) {
      console.log('   ❌ Could not get type information');
      continue;
    }
    
    const entityFields = typeInfo.fields.map(f => f.name);
    console.log(`   📋 Fields (${entityFields.length}): ${entityFields.slice(0, 15).join(', ')}${entityFields.length > 15 ? '...' : ''}`);
    
    // Try to get sample data
    const sampleData = await getSampleData(client, field.name, entityFields);
    if (sampleData.length > 0) {
      console.log(`   ✅ Sample data available (${sampleData.length} items)`);
      console.log('   📝 First item:', JSON.stringify(sampleData[0], null, 2).split('\n').slice(0, 10).join('\n').substring(0, 300));
    } else {
      console.log('   ⚠️  No sample data retrieved (might be empty or query issues)');
    }
  }
  
  // Step 6: Generate recommendations
  console.log('\n\n💡 Step 5: Recommendations');
  console.log('═'.repeat(60));
  
  console.log('\n✅ Next Steps:');
  console.log('1. Review the entities and fields above');
  console.log('2. Decide which entities are useful for reports');
  console.log('3. Check if there are timestamp/date fields for filtering recent data');
  console.log('4. Test specific queries with date ranges if needed');
  console.log('\n📝 To add this subgraph:');
  console.log(`   - Add to SUBGRAPH_CONFIGS in subgraph-config.ts`);
  console.log(`   - Create fetch function in multi-protocol-fetcher.ts`);
  console.log(`   - Add storage logic in multi-protocol-storage.ts`);
  console.log(`   - Update report generation in agent.ts`);
  
  console.log('\n💾 To save investigation results, copy the output above.\n');
}

// Main execution
const subgraphInput = process.argv[2];

if (!subgraphInput) {
  console.error('❌ Error: Please provide a subgraph ID or URL');
  console.log('\nUsage:');
  console.log('  bun run scripts/investigate-new-subgraph.ts <subgraph_id>');
  console.log('  bun run scripts/investigate-new-subgraph.ts <full_url>');
  console.log('\nExamples:');
  console.log('  bun run scripts/investigate-new-subgraph.ts 5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV');
  console.log('  bun run scripts/investigate-new-subgraph.ts https://api.thegraph.com/subgraphs/name/...');
  process.exit(1);
}

investigateSubgraph(subgraphInput).catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

