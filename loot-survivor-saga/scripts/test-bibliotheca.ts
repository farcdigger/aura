// scripts/test-bibliotheca.ts
// Test script for Bibliotheca GraphQL API

import { fetchGameData } from '../src/lib/blockchain/bibliotheca';

async function test() {
  console.log('🧪 Testing Bibliotheca GraphQL API...\n');

  // Test Game ID (Değiştir - gerçek bir Game ID koy)
  // Örnek: Loot Survivor'dan bir oyun ID'si
  const testGameId = process.argv[2] || '0x123...'; // Command line'dan al veya default

  if (testGameId === '0x123...') {
    console.log('❌ Lütfen gerçek bir Game ID girin:');
    console.log('   npm run test:bibliotheca <GAME_ID>');
    console.log('\nÖrnek: npm run test:bibliotheca 0xabcd...');
    process.exit(1);
  }

  try {
    console.log(`📡 Fetching game data for: ${testGameId}`);
    const data = await fetchGameData(testGameId);

    console.log('\n✅ Success! Game data fetched:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Adventurer ID: ${data.adventurer.id}`);
    console.log(`Name: ${data.adventurer.name || 'Unnamed'}`);
    console.log(`Level: ${data.adventurer.level}`);
    console.log(`Health: ${data.adventurer.health}`);
    console.log(`XP: ${data.adventurer.xp}`);
    console.log(`Gold: ${data.adventurer.gold}`);
    console.log(`Total Events: ${data.logs.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (data.logs.length > 0) {
      console.log('\n📋 First 5 events:');
      data.logs.slice(0, 5).forEach((log, i) => {
        console.log(`  ${i + 1}. Turn ${log.turnNumber}: ${log.eventType}`);
      });
    }

    console.log('\n✅ Test passed! Bibliotheca API is working.');
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

test();








