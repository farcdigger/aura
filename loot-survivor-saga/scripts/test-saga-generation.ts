// scripts/test-saga-generation.ts
// Test saga generation endpoint

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testSagaGeneration() {
  // Test game ID (gerçek bir game ID kullan)
  const gameId = process.argv[2] || '12345';

  console.log('🧪 Testing Saga Generation...\n');
  console.log(`Game ID: ${gameId}\n`);

  try {
    // 1. Generate saga
    console.log('📤 Requesting saga generation...');
    const generateResponse = await axios.post(`${API_URL}/api/saga/generate`, {
      gameId
    });

    console.log('✅ Saga generation started:', generateResponse.data);
    const { sagaId } = generateResponse.data;

    // 2. Poll status
    console.log('\n📊 Polling saga status...');
    let status = 'pending';
    let attempts = 0;
    const maxAttempts = 60; // 5 dakika (5 saniye interval)

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 saniye bekle

      const statusResponse = await axios.get(`${API_URL}/api/saga/${sagaId}/status`);
      const saga = statusResponse.data;

      status = saga.status;
      const progress = saga.progress || {};

      console.log(`[${attempts + 1}/${maxAttempts}] Status: ${status}`, progress);

      attempts++;
    }

    // 3. Get final saga
    if (status === 'completed') {
      console.log('\n📖 Fetching final saga...');
      const sagaResponse = await axios.get(`${API_URL}/api/saga/${sagaId}`);
      const saga = sagaResponse.data;

      console.log('\n✅ Saga completed!');
      console.log(`Title: ${saga.story_text}`);
      console.log(`Panels: ${saga.total_panels}`);
      console.log(`Generation time: ${saga.generation_time_seconds}s`);
      console.log(`Cost: $${saga.cost_usd}`);
    } else {
      console.log('\n❌ Saga generation failed or timed out');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testSagaGeneration();

