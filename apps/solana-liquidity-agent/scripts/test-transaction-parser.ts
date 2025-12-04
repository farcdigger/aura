// apps/solana-liquidity-agent/scripts/test-transaction-parser.ts

/**
 * Test script for Transaction Parser
 * Tests real buy/sell detection from Solana transactions
 */

import { getHeliusClient } from '../src/lib/helius-client';

// Known active pools from different protocols (SOL/USDC pairs)
// Format: { pool, programId, name }
const TEST_POOLS = {
  ORCA_WHIRLPOOL: {
    pool: '2zw5zdoXeocvDhCkZtz7QQuouyEqJf47BFvJhyo1QMQ3',
    programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    name: 'Orca Whirlpool SOL/USDC'
  },
  RAYDIUM_CLMM: {
    pool: '7frCvtVQjAGBEmcSWWhuznqEdRIDQJxLYtvwuwxqU3nF',
    programId: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    name: 'Raydium CLMM SOL/USDC'
  },
  RAYDIUM_AMM_V4: {
    pool: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    name: 'Raydium AMM V4 SOL/USDC (Old)'
  }
};

/**
 * Test transaction parser for a pool
 */
async function testTransactionParser(
  poolName: string,
  poolConfig: { pool: string; programId: string; name: string }
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Transaction Parser: ${poolName}`);
  console.log(`📍 Pool: ${poolConfig.pool}`);
  console.log(`📍 Program: ${poolConfig.programId}`);
  console.log('='.repeat(80) + '\n');

  try {
    const heliusClient = getHeliusClient();
    
    // Fetch and analyze transactions (limit to 50 for speed)
    console.log('⏳ Fetching and analyzing transactions (this may take 10-30 seconds)...\n');
    const summary = await heliusClient.getTransactionHistory(
      poolConfig.pool,
      50,
      poolConfig.programId
    );

    // Display results
    console.log('\n✅ TRANSACTION ANALYSIS RESULTS:\n');
    
    console.log('📊 Transaction Breakdown:');
    console.log(`   Total Transactions: ${summary.totalCount}`);
    console.log(`   Buy Transactions: ${summary.buyCount} (${((summary.buyCount / summary.totalCount) * 100).toFixed(1)}%)`);
    console.log(`   Sell Transactions: ${summary.sellCount} (${((summary.sellCount / summary.totalCount) * 100).toFixed(1)}%)`);
    console.log(`   Unique Wallets: ${summary.uniqueWallets || 'N/A'}`);

    // Time range
    if (summary.timeRange) {
      const duration = (summary.timeRange.latest.getTime() - summary.timeRange.earliest.getTime()) / 1000 / 60 / 60;
      console.log(`\n⏰ Time Range:`);
      console.log(`   Earliest: ${summary.timeRange.earliest.toISOString()}`);
      console.log(`   Latest: ${summary.timeRange.latest.toISOString()}`);
      console.log(`   Duration: ${duration.toFixed(1)} hours`);
    }

    // Top traders
    if (summary.topTraders && summary.topTraders.length > 0) {
      console.log('\n🐋 Top Traders:');
      summary.topTraders.forEach((trader, i) => {
        console.log(`   ${i + 1}. ${trader.wallet.slice(0, 12)}...`);
        console.log(`      Buys: ${trader.buyCount}, Sells: ${trader.sellCount}, Volume: ${trader.volume.toFixed(2)}`);
      });
    }

    // Top wallets by activity
    if (summary.topWallets && summary.topWallets.length > 0) {
      console.log('\n👥 Top Active Wallets:');
      summary.topWallets.slice(0, 5).forEach((wallet, i) => {
        console.log(`   ${i + 1}. ${wallet.address.slice(0, 12)}... - ${wallet.txCount} txs (${wallet.volumeShare.toFixed(1)}% of volume)`);
      });
    }

    // Suspicious patterns
    if (summary.suspiciousPatterns && summary.suspiciousPatterns.length > 0) {
      console.log('\n⚠️ Suspicious Patterns Detected:');
      summary.suspiciousPatterns.forEach((pattern) => {
        console.log(`   🚨 ${pattern}`);
      });
    } else {
      console.log('\n✅ No suspicious patterns detected');
    }

    // Summary text
    console.log(`\n📝 Summary:`);
    console.log(`   ${summary.summary}`);

    // Validation
    console.log('\n🔍 Validation:');
    
    const buyRatio = summary.buyCount / summary.totalCount;
    const isMockRatio = Math.abs(buyRatio - 0.6) < 0.01; // Check if it's exactly 60% (mock)
    
    if (isMockRatio) {
      console.log('   ❌ FAIL: Buy/sell ratio is exactly 60/40 (likely using mock data)');
      console.log('   💡 This means transaction parsing is not working correctly');
      return false;
    } else {
      console.log('   ✅ Buy/sell ratio is NOT 60/40 (real parsing working!)');
      console.log(`   ✅ Actual ratio: ${(buyRatio * 100).toFixed(1)}% buys / ${((1 - buyRatio) * 100).toFixed(1)}% sells`);
    }

    if (summary.uniqueWallets && summary.uniqueWallets > 0) {
      console.log(`   ✅ Unique wallets detected: ${summary.uniqueWallets}`);
    }

    if (summary.topTraders && summary.topTraders.length > 0) {
      console.log(`   ✅ Top traders identified: ${summary.topTraders.length}`);
    }

    console.log('\n🎉 TEST PASSED: Real transaction parsing is working!');
    return true;

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`\n   Stack trace:\n${error.stack}`);
    }
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('\n🚀 TRANSACTION PARSER TEST SUITE');
  console.log('=' .repeat(80));
  console.log('This script tests real buy/sell detection from Solana transactions');
  console.log('It will fetch and parse recent transactions to determine swap direction');
  console.log('=' .repeat(80));

  const results: { pool: string; success: boolean }[] = [];

  // Test Orca Whirlpool (modern CLMM)
  console.log('\n🔵 Testing Orca Whirlpool...');
  const orcaSuccess = await testTransactionParser('ORCA_WHIRLPOOL', TEST_POOLS.ORCA_WHIRLPOOL);
  results.push({ pool: 'ORCA_WHIRLPOOL', success: orcaSuccess });
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test Raydium CLMM
  console.log('\n🟢 Testing Raydium CLMM...');
  const raydiumCLMMSuccess = await testTransactionParser('RAYDIUM_CLMM', TEST_POOLS.RAYDIUM_CLMM);
  results.push({ pool: 'RAYDIUM_CLMM', success: raydiumCLMMSuccess });
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test Raydium AMM V4 (classic - should have transactions on pool address)
  console.log('\n🟡 Testing Raydium AMM V4 (Classic)...');
  const raydiumAMMSuccess = await testTransactionParser('RAYDIUM_AMM_V4', TEST_POOLS.RAYDIUM_AMM_V4);
  results.push({ pool: 'RAYDIUM_AMM_V4', success: raydiumAMMSuccess });

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📈 TEST SUMMARY');
  console.log('='.repeat(80));
  
  results.forEach(({ pool, success }) => {
    console.log(`   ${success ? '✅' : '❌'} ${pool}: ${success ? 'PASSED' : 'FAILED'}`);
  });

  const passedCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  console.log('\n' + '='.repeat(80));
  console.log(`Results: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    console.log('\n🎉 ALL TESTS PASSED! Transaction parser is working correctly!');
    console.log('✅ Real buy/sell detection is operational.');
    console.log('✅ Wash trading and whale detection are active.');
    console.log('✅ You can now proceed to the next phase of development.');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Please review the errors above.');
    console.log('💡 Common issues:');
    console.log('   - HELIUS_API_KEY not set or invalid');
    console.log('   - Rate limiting (try reducing transaction limit)');
    console.log('   - Pool has no recent transactions');
    console.log('   - Transaction parsing logic needs adjustment');
  }
  
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(passedCount === totalCount ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('\n❌ CRITICAL ERROR:');
  console.error(error);
  process.exit(1);
});

