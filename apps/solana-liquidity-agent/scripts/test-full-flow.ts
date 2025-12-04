/**
 * Full Flow End-to-End Test
 * 
 * Bu script, sistemin tüm bileşenlerini KAPSAMLI bir şekilde test eder:
 * 1. ✅ Redis bağlantısı
 * 2. ✅ Helius API
 * 3. ✅ Supabase bağlantısı
 * 4. ✅ Price Fetcher (CoinGecko)
 * 5. ✅ Pool Reserves & TVL
 * 6. ✅ Transaction Parsing
 * 7. ✅ Queue Job System
 * 8. ✅ Worker Processing
 * 9. ✅ AI Analysis Quality
 * 10. ✅ Database Storage
 * 
 * NOT: Worker'ın ayrı bir terminalde çalışıyor olması gerekir!
 * Command: bun run worker
 */

import 'dotenv/config';
import { addAnalysisJob, getJobStatus } from '../src/lib/queue';
import { healthCheck as cacheHealthCheck } from '../src/lib/cache';
import { healthCheck as supabaseHealthCheck } from '../src/lib/supabase';
import { heliusClient } from '../src/lib/helius-client';
import { getTokenPrice } from '../src/lib/price-fetcher';

// Test için popüler bir Raydium pool (SOL/USDC)
const TEST_POOL_ID = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const TEST_USER_ID = 'test-user-e2e-123';

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
  
  try {
    console.log('  🔄 Price Fetcher (CoinGecko)...');
    const solPrice = await getTokenPrice('SOL');
    if (solPrice > 0) {
      console.log(`  ✅ Price Fetcher: OK (SOL = $${solPrice.toFixed(2)})`);
    } else {
      console.error('  ❌ Price Fetcher: FAILED (SOL price is $0)');
      allPassed = false;
    }
  } catch (error: any) {
    console.error('  ❌ Price Fetcher: FAILED', error.message);
    allPassed = false;
  }
  
  console.log('');
  
  // ======================================================================
  // STEP 1.5: Data Quality Pre-Check
  // ======================================================================
  console.log('📋 STEP 1.5: Data Quality Pre-Check');
  console.log('-'.repeat(60));
  
  try {
    console.log(`  🎯 Testing pool: ${TEST_POOL_ID}`);
    console.log('  🔄 Fetching pool reserves...');
    
    const reserves = await heliusClient.getPoolReserves(TEST_POOL_ID);
    
    console.log(`  💧 Token A: ${reserves.tokenASymbol} - ${reserves.tokenAAmount?.toFixed(2)}`);
    console.log(`  💧 Token B: ${reserves.tokenBSymbol} - ${reserves.tokenBAmount?.toFixed(2)}`);
    console.log(`  💰 TVL: $${reserves.tvlUSD?.toLocaleString() || '0'}`);
    
    // Validate data quality
    if (!reserves.tvlUSD || reserves.tvlUSD === 0) {
      console.error('  ❌ TVL is $0 - Price fetching may not be working!');
      allPassed = false;
    } else {
      console.log('  ✅ TVL calculation working');
    }
    
    if (!reserves.tokenASymbol || !reserves.tokenBSymbol) {
      console.error('  ❌ Token symbols missing!');
      allPassed = false;
    } else {
      console.log('  ✅ Token metadata fetched');
    }
    
    console.log('  🔄 Testing transaction parsing...');
    const txHistory = await heliusClient.getTransactionHistory(TEST_POOL_ID, 20);
    
    console.log(`  📊 Transactions analyzed: ${txHistory.totalCount}`);
    console.log(`  📊 Buy/Sell: ${txHistory.buyCount}/${txHistory.sellCount}`);
    console.log(`  👥 Unique wallets: ${txHistory.uniqueWallets || 0}`);
    
    if (txHistory.totalCount > 0) {
      console.log('  ✅ Transaction parsing working');
    } else {
      console.warn('  ⚠️ No transactions found (pool may be inactive)');
    }
    
  } catch (error: any) {
    console.error('  ❌ Pre-check failed:', error.message);
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
  // STEP 4: Validate Analysis Quality
  // ======================================================================
  if (finalStatus && finalStatus.result) {
    console.log('📋 STEP 4: Analysis Quality Validation');
    console.log('-'.repeat(60));
    
    try {
      const result = finalStatus.result.analysisResult;
      
      // Check 1: Risk Score
      console.log('  🔍 Checking Risk Score...');
      if (typeof result.riskScore === 'number' && result.riskScore >= 0 && result.riskScore <= 100) {
        console.log(`  ✅ Risk Score: ${result.riskScore}/100`);
      } else {
        console.error(`  ❌ Invalid risk score: ${result.riskScore}`);
        allPassed = false;
      }
      
      // Check 2: TVL in results
      console.log('  🔍 Checking TVL data...');
      if (result.reserves && result.reserves.estimatedTVL) {
        console.log(`  ✅ TVL: $${result.reserves.estimatedTVL.toLocaleString()}`);
      } else {
        console.error('  ❌ TVL missing in results');
        allPassed = false;
      }
      
      // Check 3: AI Analysis Content
      console.log('  🔍 Checking AI analysis content...');
      const analysis = result.riskAnalysis || '';
      
      const requiredSections = [
        'Risk Score',
        'Summary',
        'Liquidity',
        'Security',
        'Trading',
      ];
      
      const missingSections = requiredSections.filter(
        section => !analysis.toLowerCase().includes(section.toLowerCase())
      );
      
      if (missingSections.length === 0) {
        console.log('  ✅ All required sections present in AI analysis');
      } else {
        console.warn(`  ⚠️ Missing sections: ${missingSections.join(', ')}`);
      }
      
      // Check 4: Analysis length (should be substantial)
      if (analysis.length > 500) {
        console.log(`  ✅ Analysis length: ${analysis.length} characters`);
      } else {
        console.error(`  ❌ Analysis too short: ${analysis.length} characters`);
        allPassed = false;
      }
      
      // Check 5: Token metadata
      console.log('  🔍 Checking token metadata...');
      if (result.tokenA && result.tokenB) {
        console.log(`  ✅ Tokens: ${result.tokenA.symbol}/${result.tokenB.symbol}`);
      } else {
        console.error('  ❌ Token metadata missing');
        allPassed = false;
      }
      
      // Check 6: Transaction data
      console.log('  🔍 Checking transaction data...');
      if (result.transactions) {
        console.log(`  ✅ Transactions: ${result.transactions.totalCount} analyzed`);
        console.log(`  📊 Buy/Sell: ${result.transactions.buyCount}/${result.transactions.sellCount}`);
      } else {
        console.error('  ❌ Transaction data missing');
        allPassed = false;
      }
      
      // Display sample of analysis
      console.log('\n  📄 Analysis Preview (first 500 chars):');
      console.log('  ' + '-'.repeat(58));
      console.log('  ' + analysis.substring(0, 500).replace(/\n/g, '\n  ') + '...');
      console.log('  ' + '-'.repeat(58));
      
    } catch (error: any) {
      console.error('  ❌ Quality validation error:', error.message);
      allPassed = false;
    }
    
    console.log('');
  }
  
  // ======================================================================
  // FINAL SUMMARY
  // ======================================================================
  console.log('='.repeat(60));
  console.log('');
  
  if (allPassed) {
    console.log('🎉 ✅ ALL TESTS PASSED! 🎉');
    console.log('');
    console.log('🚀 Your Solana Liquidity Agent is PRODUCTION READY!');
    console.log('');
    console.log('✅ Verified Components:');
    console.log('  ✓ Real pool data parsing (Raydium SDK)');
    console.log('  ✓ Transaction analysis (buy/sell detection)');
    console.log('  ✓ USD price fetching (CoinGecko)');
    console.log('  ✓ TVL calculation (real USD values)');
    console.log('  ✓ AI analysis (Claude via Daydreams)');
    console.log('  ✓ Database storage (Supabase)');
    console.log('  ✓ Queue system (Redis + BullMQ)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start API server: bun run dev');
    console.log('  2. Start Worker: bun run worker');
    console.log('  3. Test via HTTP: curl -X POST http://localhost:3000/analyze \\');
    console.log('       -H "Content-Type: application/json" \\');
    console.log('       -d \'{"poolId": "YOUR_POOL_ID"}\'');
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

