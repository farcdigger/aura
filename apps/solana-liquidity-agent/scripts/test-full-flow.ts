/**
 * Full Flow Test
 * 
 * Bu script, sistemin tüm bileşenlerini test eder:
 * 1. Redis bağlantısı
 * 2. Helius API
 * 3. Supabase bağlantısı
 * 4. Queue'ya job ekleme
 * 5. Job durumu kontrolü
 * 
 * NOT: Worker'ın ayrı bir terminalde çalışıyor olması gerekir!
 */

import 'dotenv/config';
import { addAnalysisJob, getJobStatus } from '../src/lib/queue';
import { healthCheck as cacheHealthCheck } from '../src/lib/cache';
import { healthCheck as supabaseHealthCheck } from '../src/lib/supabase';
import { heliusClient } from '../src/lib/helius-client';

// Test için popüler bir Raydium pool (SOL/USDC)
const TEST_POOL_ID = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const TEST_USER_ID = 'test-user-123';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFullFlow() {
  console.log('🧪 FULL FLOW TEST');
  console.log('='.repeat(60));
  console.log('');
  
  let allPassed = true;
  
  // ======================================================================
  // STEP 1: System Health Checks
  // ======================================================================
  console.log('📋 STEP 1: System Health Checks');
  console.log('-'.repeat(60));
  
  try {
    console.log('  🔄 Redis...');
    await cacheHealthCheck();
    console.log('  ✅ Redis: OK');
  } catch (error: any) {
    console.error('  ❌ Redis: FAILED', error.message);
    allPassed = false;
  }
  
  try {
    console.log('  🔄 Supabase...');
    await supabaseHealthCheck();
    console.log('  ✅ Supabase: OK');
  } catch (error: any) {
    console.error('  ❌ Supabase: FAILED', error.message);
    allPassed = false;
  }
  
  try {
    console.log('  🔄 Helius API...');
    await heliusClient.healthCheck();
    console.log('  ✅ Helius: OK');
  } catch (error: any) {
    console.error('  ❌ Helius: FAILED', error.message);
    allPassed = false;
  }
  
  console.log('');
  
  // ======================================================================
  // STEP 2: Queue Job Submission
  // ======================================================================
  console.log('📋 STEP 2: Submit Analysis Job');
  console.log('-'.repeat(60));
  
  let jobId: string | null = null;
  
  try {
    console.log(`  🎯 Pool ID: ${TEST_POOL_ID}`);
    console.log(`  👤 User ID: ${TEST_USER_ID}`);
    
    const job = await addAnalysisJob({
      poolId: TEST_POOL_ID,
      userId: TEST_USER_ID,
      options: {
        transactionLimit: 100, // Test için küçük tutuyoruz
      },
    });
    
    jobId = job.id!;
    
    console.log(`  ✅ Job created: ${jobId}`);
    console.log('');
  } catch (error: any) {
    console.error(`  ❌ Job creation failed: ${error.message}`);
    allPassed = false;
    return;
  }
  
  // ======================================================================
  // STEP 3: Job Status Polling
  // ======================================================================
  console.log('📋 STEP 3: Poll Job Status');
  console.log('-'.repeat(60));
  console.log('  ⚠️  Make sure Worker is running in another terminal!');
  console.log('  ⚠️  Command: bun run worker');
  console.log('');
  
  const MAX_WAIT_TIME = 120000; // 2 dakika
  const POLL_INTERVAL = 3000; // 3 saniye
  const startTime = Date.now();
  
  let finalStatus: any = null;
  
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    try {
      const status = await getJobStatus(jobId);
      
      if (!status) {
        console.error('  ❌ Job not found!');
        allPassed = false;
        break;
      }
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [${elapsed}s] State: ${status.status} | Progress: ${status.progress || 0}%`);
      
      if (status.status === 'completed') {
        console.log('');
        console.log('  ✅ Job completed successfully!');
        console.log('  📊 Result:');
        console.log(JSON.stringify(status.result, null, 2));
        finalStatus = status;
        break;
      }
      
      if (status.status === 'failed') {
        console.log('');
        console.error('  ❌ Job failed!');
        console.error('  Error:', status.error);
        allPassed = false;
        break;
      }
      
      // Bekle ve tekrar dene
      await sleep(POLL_INTERVAL);
      
    } catch (error: any) {
      console.error(`  ❌ Polling error: ${error.message}`);
      allPassed = false;
      break;
    }
  }
  
  if (!finalStatus && Date.now() - startTime >= MAX_WAIT_TIME) {
    console.error('  ❌ Timeout! Job did not complete in 2 minutes.');
    console.error('  💡 Check if Worker is running: bun run worker');
    allPassed = false;
  }
  
  console.log('');
  
  // ======================================================================
  // FINAL SUMMARY
  // ======================================================================
  console.log('='.repeat(60));
  console.log('');
  
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED! 🎉');
    console.log('');
    console.log('🚀 Your Solana Liquidity Agent is ready!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start API server: bun run dev');
    console.log('  2. Start Worker: bun run worker');
    console.log('  3. Test via HTTP: curl http://localhost:3000/analyze ...');
    console.log('');
  } else {
    console.log('❌ SOME TESTS FAILED!');
    console.log('');
    console.log('Please check:');
    console.log('  - .env file is properly configured');
    console.log('  - Redis (Upstash) is accessible');
    console.log('  - Supabase connection is working');
    console.log('  - Helius API key is valid');
    console.log('  - Worker is running in another terminal');
    console.log('');
    process.exit(1);
  }
}

// Run test
testFullFlow().catch((error) => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});

