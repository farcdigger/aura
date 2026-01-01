// Script to get transaction hash for a game ID
// Usage: npx tsx scripts/get-transaction-hash.ts <gameId>

import axios from 'axios';

const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';

async function getTransactionHash(gameId: string) {
  // Torii API'den battles ve discoveries query'si ile transaction hash'leri çek
  const query = `
    query GetGameTransactions($adventurerId: String!) {
      # Battles query - transaction hash'leri için
      battles(
        where: { adventurerId: $adventurerId }
        orderBy: { direction: DESC, field: TIMESTAMP }
        first: 10
      ) {
        edges {
          node {
            id
            adventurerId
            beastId
            damage
            timestamp
            txHash
          }
        }
      }
      
      # Discoveries query - transaction hash'leri için
      discoveries(
        where: { adventurerId: $adventurerId }
        orderBy: { direction: DESC, field: TIMESTAMP }
        first: 10
      ) {
        edges {
          node {
            id
            adventurerId
            discoveryType
            timestamp
            txHash
          }
        }
      }
    }
  `;

  try {
    console.log(`🔍 Fetching transactions for game ID: ${gameId}`);
    
    const response = await axios.post(GRAPHQL_URL, {
      query,
      variables: { adventurerId: gameId }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.errors) {
      console.error('GraphQL Error:', response.data.errors);
      return null;
    }

    const battles = response.data.data?.battles?.edges || [];
    const discoveries = response.data.data?.discoveries?.edges || [];

    console.log('\n📊 Transaction Hashes Found:');
    console.log('='.repeat(60));
    
    if (battles.length > 0) {
      console.log('\n⚔️  Battles:');
      battles.forEach((edge: any, i: number) => {
        const node = edge.node;
        console.log(`  ${i + 1}. Battle ${node.id}`);
        console.log(`     TX Hash: ${node.txHash || 'N/A'}`);
        console.log(`     Timestamp: ${node.timestamp || 'N/A'}`);
        console.log(`     Damage: ${node.damage || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('\n⚔️  No battles found');
    }

    if (discoveries.length > 0) {
      console.log('\n🔍 Discoveries:');
      discoveries.forEach((edge: any, i: number) => {
        const node = edge.node;
        console.log(`  ${i + 1}. Discovery ${node.id}`);
        console.log(`     TX Hash: ${node.txHash || 'N/A'}`);
        console.log(`     Timestamp: ${node.timestamp || 'N/A'}`);
        console.log(`     Type: ${node.discoveryType || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('\n🔍 No discoveries found');
    }

    // İlk transaction hash'i döndür (en yeni)
    const firstBattle = battles[0]?.node;
    const firstDiscovery = discoveries[0]?.node;
    
    const txHash = firstBattle?.txHash || firstDiscovery?.txHash;
    
    if (txHash) {
      console.log('\n✅ First Transaction Hash:', txHash);
      return txHash;
    } else {
      console.log('\n⚠️  No transaction hash found');
      return null;
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

// Main
const gameId = process.argv[2] || '133595';
getTransactionHash(gameId).then(txHash => {
  if (txHash) {
    console.log(`\n📋 Transaction Hash for Game ${gameId}:`);
    console.log(txHash);
  }
  process.exit(0);
});








