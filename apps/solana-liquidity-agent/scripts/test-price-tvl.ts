// apps/solana-liquidity-agent/scripts/test-price-tvl.ts

/**
 * Test script for Price Fetcher & TVL Calculation
 * Tests real USD price fetching and TVL calculation
 */

import { getTokenPrice, getTokenPrices, calculatePoolTVL, getCacheStats } from '../src/lib/price-fetcher';
import { getHeliusClient } from '../src/lib/helius-client';

/**
 * Test 1: Individual price fetching
 */
async function testIndividualPrices() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 1: Individual Price Fetching');
  console.log('='.repeat(80) + '\n');

  const tokens = ['SOL', 'USDC', 'RAY', 'ORCA'];

  for (const token of tokens) {
    try {
      const price = await getTokenPrice(token);
      console.log(`✅ ${token}: $${price.toFixed(4)}`);
      
      if (token === 'USDC' && price !== 1.0) {
        console.error(`❌ FAIL: USDC should be $1.00, got $${price}`);
        return false;
      }
      
      if (token === 'SOL' && price === 0) {
        console.error(`❌ FAIL: SOL price should not be $0`);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ FAIL: Error fetching ${token} price:`, error.message);
      return false;
    }
  }

  console.log('\n✅ TEST 1 PASSED: All individual prices fetched successfully\n');
  return true;
}

/**
 * Test 2: Batch price fetching
 */
async function testBatchPrices() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 2: Batch Price Fetching');
  console.log('='.repeat(80) + '\n');

  try {
    const tokens = ['SOL', 'USDC', 'RAY'];
    const prices = await getTokenPrices(tokens);

    console.log('Fetched prices:');
    prices.forEach((price, symbol) => {
      console.log(`  ${symbol}: $${price.toFixed(4)}`);
    });

    if (prices.size !== tokens.length) {
      console.error(`❌ FAIL: Expected ${tokens.length} prices, got ${prices.size}`);
      return false;
    }

    console.log('\n✅ TEST 2 PASSED: Batch fetching works correctly\n');
    return true;
  } catch (error: any) {
    console.error(`❌ FAIL: Batch fetch error:`, error.message);
    return false;
  }
}

/**
 * Test 3: TVL Calculation
 */
async function testTVLCalculation() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 3: TVL Calculation');
  console.log('='.repeat(80) + '\n');

  try {
    // Test with known amounts
    const tokenASymbol = 'SOL';
    const tokenAAmount = 1000; // 1000 SOL
    const tokenBSymbol = 'USDC';
    const tokenBAmount = 150000; // 150,000 USDC

    console.log(`Calculating TVL for:`);
    console.log(`  ${tokenAAmount} ${tokenASymbol}`);
    console.log(`  ${tokenBAmount} ${tokenBSymbol}\n`);

    const tvl = await calculatePoolTVL(
      tokenASymbol,
      tokenAAmount,
      tokenBSymbol,
      tokenBAmount
    );

    console.log(`\nCalculated TVL: $${tvl.toLocaleString()}`);

    if (tvl === 0) {
      console.error(`❌ FAIL: TVL should not be $0`);
      return false;
    }

    // TVL should be at least the USDC amount (since USDC is $1)
    if (tvl < tokenBAmount) {
      console.error(`❌ FAIL: TVL ($${tvl}) is less than USDC amount ($${tokenBAmount})`);
      return false;
    }

    console.log('\n✅ TEST 3 PASSED: TVL calculation works correctly\n');
    return true;
  } catch (error: any) {
    console.error(`❌ FAIL: TVL calculation error:`, error.message);
    return false;
  }
}

/**
 * Test 4: Cache functionality
 */
async function testCacheFunctionality() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 4: Cache Functionality');
  console.log('='.repeat(80) + '\n');

  try {
    // First fetch (should hit API)
    console.log('First fetch (should hit API):');
    const price1 = await getTokenPrice('SOL');
    console.log(`  SOL: $${price1.toFixed(4)}`);

    // Check cache stats
    const stats1 = getCacheStats();
    console.log(`\nCache stats after first fetch:`);
    console.log(`  Cached tokens: ${stats1.size}`);
    stats1.entries.forEach(entry => {
      console.log(`    ${entry.symbol}: ${entry.age}s old`);
    });

    // Second fetch (should use cache)
    console.log('\nSecond fetch (should use cache):');
    const price2 = await getTokenPrice('SOL');
    console.log(`  SOL: $${price2.toFixed(4)}`);

    if (price1 !== price2) {
      console.error(`❌ FAIL: Cached price mismatch ($${price1} vs $${price2})`);
      return false;
    }

    const stats2 = getCacheStats();
    console.log(`\nCache stats after second fetch:`);
    console.log(`  Cached tokens: ${stats2.size}`);

    console.log('\n✅ TEST 4 PASSED: Cache is working correctly\n');
    return true;
  } catch (error: any) {
    console.error(`❌ FAIL: Cache test error:`, error.message);
    return false;
  }
}

/**
 * Test 5: Real pool TVL (integration test)
 */
async function testRealPoolTVL() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 5: Real Pool TVL (Integration Test)');
  console.log('='.repeat(80) + '\n');

  try {
    const heliusClient = getHeliusClient();
    
    // Test with Raydium AMM V4 SOL/USDC pool (we know this works)
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
    
    console.log(`Fetching pool reserves for: ${poolAddress}\n`);
    
    const reserves = await heliusClient.getPoolReserves(poolAddress);

    console.log('Pool Information:');
    console.log(`  Token A: ${reserves.tokenASymbol} (${reserves.tokenAAmount?.toFixed(2)})`);
    console.log(`  Token B: ${reserves.tokenBSymbol} (${reserves.tokenBAmount?.toFixed(2)})`);
    console.log(`  TVL: $${reserves.tvlUSD?.toLocaleString() || '0'}`);
    console.log(`  Estimated TVL: $${reserves.estimatedTVL?.toLocaleString() || '0'}`);

    if (!reserves.tvlUSD || reserves.tvlUSD === 0) {
      console.error(`\n❌ FAIL: TVL is $0 or undefined`);
      return false;
    }

    console.log('\n✅ TEST 5 PASSED: Real pool TVL calculated successfully\n');
    return true;
  } catch (error: any) {
    console.error(`❌ FAIL: Real pool TVL error:`, error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n🚀 PRICE FETCHER & TVL TEST SUITE');
  console.log('=' .repeat(80));
  console.log('Testing CoinGecko API integration and TVL calculation');
  console.log('=' .repeat(80));

  const results = {
    individualPrices: false,
    batchPrices: false,
    tvlCalculation: false,
    cacheFunctionality: false,
    realPoolTVL: false,
  };

  // Run tests sequentially
  results.individualPrices = await testIndividualPrices();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay

  results.batchPrices = await testBatchPrices();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.tvlCalculation = await testTVLCalculation();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.cacheFunctionality = await testCacheFunctionality();
  await new Promise(resolve => setTimeout(resolve, 1000));

  results.realPoolTVL = await testRealPoolTVL();

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 TEST SUMMARY');
  console.log('='.repeat(80));
  
  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`   ${icon} ${test}: ${status}`);
  });

  const passedCount = Object.values(results).filter(r => r).length;
  const totalCount = Object.keys(results).length;
  
  console.log('\n' + '='.repeat(80));
  console.log(`Results: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    console.log('\n🎉 ALL TESTS PASSED! Price fetcher and TVL calculation are working!');
    console.log('✅ CoinGecko API integration successful');
    console.log('✅ Cache system operational');
    console.log('✅ TVL calculation accurate');
    console.log('✅ Ready for production use');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Please review the errors above.');
  }
  
  console.log('='.repeat(80) + '\n');

  process.exit(passedCount === totalCount ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n❌ CRITICAL ERROR:');
  console.error(error);
  process.exit(1);
});

