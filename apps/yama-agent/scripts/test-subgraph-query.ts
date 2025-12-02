/**
 * Test Subgraph Query Script
 * 
 * Quick tool to test a specific GraphQL query on a subgraph
 * Useful for testing field availability and data structure
 * 
 * Usage: bun run scripts/test-subgraph-query.ts <subgraph_id> <query_file>
 */

import { GraphQLClient } from 'graphql-request';
import { readFileSync } from 'fs';

function getSubgraphUrl(input: string): string {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  
  const apiKey = process.env.THE_GRAPH_API_KEY;
  if (apiKey) {
    return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${input}`;
  }
  
  return `https://api.thegraph.com/subgraphs/id/${input}`;
}

async function testQuery(subgraphInput: string, queryInput: string) {
  console.log('🧪 Subgraph Query Tester');
  console.log('═'.repeat(60));
  
  // Determine if queryInput is a file or direct query string
  let query: string;
  if (queryInput.endsWith('.graphql') || queryInput.endsWith('.gql')) {
    console.log(`📄 Reading query from file: ${queryInput}`);
    try {
      query = readFileSync(queryInput, 'utf-8');
    } catch (error: any) {
      console.error(`❌ Failed to read query file: ${error.message}`);
      process.exit(1);
    }
  } else {
    query = queryInput;
  }
  
  const url = getSubgraphUrl(subgraphInput);
  console.log(`📡 Connecting to: ${url}`);
  console.log(`\n📝 Query:\n${query}\n`);
  
  const client = new GraphQLClient(url);
  
  console.log('⏳ Executing query...\n');
  const startTime = Date.now();
  
  try {
    const result = await client.request(query);
    const duration = Date.now() - startTime;
    
    console.log('✅ Query Successful!');
    console.log(`⏱️  Duration: ${duration}ms\n`);
    console.log('📊 Result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Calculate result size
    const resultStr = JSON.stringify(result);
    const sizeKB = (resultStr.length / 1024).toFixed(2);
    console.log(`\n📦 Result size: ${sizeKB} KB`);
    
    // Count items if it's an array response
    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        console.log(`📋 ${key}: ${value.length} items`);
      }
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Query Failed (${duration}ms)`);
    console.error(`Error: ${error.message}`);
    
    if (error.response?.errors) {
      console.error('\nGraphQL Errors:');
      error.response.errors.forEach((err: any, i: number) => {
        console.error(`\n${i + 1}. ${err.message}`);
        if (err.locations) {
          console.error(`   Location: line ${err.locations[0].line}, column ${err.locations[0].column}`);
        }
      });
    }
    
    process.exit(1);
  }
}

// Parse command line arguments
const subgraphInput = process.argv[2];
const queryInput = process.argv[3];

if (!subgraphInput || !queryInput) {
  console.error('❌ Error: Missing required arguments\n');
  console.log('Usage:');
  console.log('  bun run scripts/test-subgraph-query.ts <subgraph_id> <query>');
  console.log('  bun run scripts/test-subgraph-query.ts <subgraph_id> <query_file.graphql>\n');
  console.log('Examples:');
  console.log('  # Direct query string');
  console.log('  bun run scripts/test-subgraph-query.ts ABC123 "{ pools(first: 5) { id } }"');
  console.log('\n  # From file');
  console.log('  bun run scripts/test-subgraph-query.ts ABC123 test-query.graphql\n');
  process.exit(1);
}

testQuery(subgraphInput, queryInput).catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

