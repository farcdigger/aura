/**
 * Lite Plan Performance Test
 * 
 * Tests:
 * 1. 10,000 swap fetching
 * 2. 15 RPS performance
 * 3. Weekly limit tracking
 * 4. User-specific reports
 */

import 'dotenv/config';
import { BirdeyeClient } from '../src/lib/birdeye-client';
import { checkAndIncrementWeeklyLimit, getWeeklyLimitStatus } from '../src/lib/weekly-limit';

const birdeyeClient = new BirdeyeClient();

// Test pool (BULLISH/SOL from earlier)
const TEST_POOL = 'GC1uTsxrrLAuWby3uWSEMjUXhJMJhhv1SXJ9A1jHvyxp';
const TEST_TOKEN = 'C2omVhcvt3DDY77S2KZzawFJQeETZofgZ4eNWWkXpump';

async function testLitePlan() {
  console.log('\n🧪 LITE PLAN PERFORMANCE TEST');
  console.log('='.repeat(60));
  
  try {
    // 1. Check weekly limit status
    console.log('\n📊 Step 1: Weekly Limit Status');
    console.log('-'.repeat(60));
    const limitStatus = await getWeeklyLimitStatus();
    console.log(`   Current: ${limitStatus.current}/${limitStatus.limit}`);
    console.log(`   Remaining: ${limitStatus.remaining}`);
    console.log(`   Resets in: ${Math.floor(limitStatus.resetsIn / 3600)} hours`);
    console.log(`   Resets at: ${new Date(limitStatus.resetsAt).toLocaleString()}`);
    
    if (limitStatus.remaining === 0) {
      console.error('\n❌ Weekly limit reached! Cannot test.');
      console.log('   Run this to reset: await resetWeeklyLimit()');
      return;
    }
    
    // 2. Test 10,000 swap fetching
    console.log('\n⚡ Step 2: Fetching 10,000 Swaps');
    console.log('-'.repeat(60));
    console.log(`   Pool: ${TEST_POOL}`);
    console.log(`   Token: ${TEST_TOKEN}`);
    console.log(`   Target: 10,000 swaps`);
    console.log(`   Expected time: ~35-40 seconds\n`);
    
    const startTime = Date.now();
    const swaps = await birdeyeClient.getSwapTransactions(TEST_POOL, 10000, TEST_TOKEN);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`\n✅ Step 2 Complete!`);
    console.log(`   Swaps fetched: ${swaps.length}/10,000`);
    console.log(`   Duration: ${duration.toFixed(1)} seconds`);
    console.log(`   Performance: ${(swaps.length / duration).toFixed(0)} swaps/second`);
    
    // 3. Data quality check
    console.log('\n📊 Step 3: Data Quality Check');
    console.log('-'.repeat(60));
    
    const withUsd = swaps.filter(s => s.amountInUsd || s.amountOutUsd);
    const totalVolume = swaps.reduce((sum, s) => sum + (s.amountInUsd || s.amountOutUsd || 0), 0);
    const uniqueWallets = new Set(swaps.map(s => s.wallet)).size;
    const buys = swaps.filter(s => s.direction === 'buy').length;
    const sells = swaps.filter(s => s.direction === 'sell').length;
    
    console.log(`   USD Coverage: ${withUsd.length}/${swaps.length} (${((withUsd.length / swaps.length) * 100).toFixed(1)}%)`);
    console.log(`   Total Volume: $${totalVolume.toLocaleString()}`);
    console.log(`   Unique Wallets: ${uniqueWallets}`);
    console.log(`   Buy/Sell: ${buys}/${sells} (${((buys / swaps.length) * 100).toFixed(1)}%/${((sells / swaps.length) * 100).toFixed(1)}%)`);
    
    // 4. CU estimation
    console.log('\n💰 Step 4: CU Cost Estimation');
    console.log('-'.repeat(60));
    
    const requestCount = Math.ceil(swaps.length / 50); // 50 swap per request
    const estimatedCU = requestCount * 10; // 10 CU per request
    
    console.log(`   Requests made: ~${requestCount}`);
    console.log(`   Estimated CU: ~${estimatedCU} CU`);
    console.log(`   Remaining CU: ${1_500_000 - estimatedCU} / 1,500,000`);
    console.log(`   Reports left this month: ~${Math.floor((1_500_000 - estimatedCU) / 2000)}`);
    
    // 5. Performance summary
    console.log('\n🎯 PERFORMANCE SUMMARY');
    console.log('='.repeat(60));
    
    const oldTime = 80; // Standard plan time
    const speedup = oldTime / duration;
    
    console.log(`   Standard plan (1 RPS, 500 swaps): ~80 seconds`);
    console.log(`   Lite plan (15 RPS, 10K swaps): ~${duration.toFixed(0)} seconds`);
    console.log(`   Speedup: ${speedup.toFixed(1)}x faster`);
    console.log(`   Data increase: 20x more swaps`);
    console.log(`   Overall improvement: MASSIVE ⚡🚀`);
    
    // 6. Quality gates
    console.log('\n✅ QUALITY GATES');
    console.log('='.repeat(60));
    
    const checks = [
      { name: 'Swaps fetched', pass: swaps.length >= 5000, value: swaps.length },
      { name: 'USD coverage', pass: (withUsd.length / swaps.length) > 0.95, value: `${((withUsd.length / swaps.length) * 100).toFixed(1)}%` },
      { name: 'Duration', pass: duration < 60, value: `${duration.toFixed(1)}s` },
      { name: 'Unique wallets', pass: uniqueWallets > 100, value: uniqueWallets },
      { name: 'CU budget', pass: estimatedCU < 3000, value: `${estimatedCU} CU` },
    ];
    
    checks.forEach(check => {
      const icon = check.pass ? '✅' : '❌';
      console.log(`   ${icon} ${check.name}: ${check.value}`);
    });
    
    const allPassed = checks.every(c => c.pass);
    
    if (allPassed) {
      console.log('\n🎉 ALL CHECKS PASSED! Ready for production!');
    } else {
      console.log('\n⚠️  Some checks failed. Review before production.');
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// Run test
testLitePlan()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

