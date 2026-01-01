// scripts/test-api.ts
// Test script for API endpoint

import axios from 'axios';

async function test() {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  const gameId = process.argv[2] || '0x123...';

  if (gameId === '0x123...') {
    console.log('❌ Lütfen gerçek bir Game ID girin:');
    console.log('   npm run test:api <GAME_ID>');
    process.exit(1);
  }

  try {
    console.log(`🧪 Testing API endpoint: ${baseUrl}/api/games/${gameId}\n`);

    const response = await axios.get(`${baseUrl}/api/games/${gameId}`);

    console.log('✅ API Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Test passed!');
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

test();








