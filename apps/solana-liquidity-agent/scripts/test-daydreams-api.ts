/**
 * Test Daydreams API directly
 */

import 'dotenv/config';

const INFERENCE_API_KEY = process.env.INFERENCE_API_KEY;
const BASE_URL = process.env.DAYDREAMS_BASE_URL || 'https://api-beta.daydreams.systems/v1';
const MODEL = process.env.REPORT_MODEL || 'openai/gpt-4o';

console.log('🧪 Testing Daydreams API');
console.log('='.repeat(60));
console.log('');
console.log('📍 Base URL:', BASE_URL);
console.log('🤖 Model:', MODEL);
console.log('🔑 API Key:', INFERENCE_API_KEY ? `${INFERENCE_API_KEY.substring(0, 20)}...` : 'MISSING!');
console.log('');

async function testDaydreamsAPI() {
  try {
    console.log('📡 Sending test request to Daydreams...');
    
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INFERENCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello from Daydreams!" in exactly 5 words.',
          },
        ],
        max_tokens: 50,
      }),
    });

    console.log('📊 Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:');
      console.error('   Status:', response.status);
      console.error('   Body:', errorText);
      return;
    }

    const data = await response.json();
    console.log('');
    console.log('✅ SUCCESS!');
    console.log('');
    console.log('📝 Response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0]) {
      console.log('');
      console.log('💬 Message:', data.choices[0].message?.content);
    }

  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
  }
}

testDaydreamsAPI();

