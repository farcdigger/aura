// apps/solana-liquidity-agent/scripts/test-raydium-parser.ts

/**
 * Test script for Raydium Parser
 * Tests real Raydium pool parsing functionality
 */

import { getHeliusClient } from '../src/lib/helius-client';

// Known Raydium V4 Pools (Production mainnet)
const KNOWN_RAYDIUM_POOLS = {
  SOL_USDC: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // Raydium SOL/USDC
  RAY_USDC: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg', // Raydium RAY/USDC
  RAY_SOL: 'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA',  // Raydium RAY/SOL
};

/**
 * Test individual pool parsing
 */
async function testPoolParsing(poolName: string, poolAddress: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Pool: ${poolName}`);
  console.log(`📍 Address: ${poolAddress}`);
  console.log('='.repeat(80));

  try {
    const heliusClient = getHeliusClient();
    
    // Fetch and parse pool reserves
    const reserves = await heliusClient.getPoolReserves(poolAddress);

    // Display results
    console.log('\n✅ PARSED SUCCESSFULLY!\n');
    
    console.log('📊 Pool Information:');
    console.log(`   Token A: ${reserves.tokenASymbol || 'Unknown'} (${reserves.tokenAMint})`);
    console.log(`   Token B: ${reserves.tokenBSymbol || 'Unknown'} (${reserves.tokenBMint})`);
    
    console.log('\n💧 Reserves:');
    console.log(`   ${reserves.tokenASymbol || 'Token A'}: ${reserves.tokenAReserve.toLocaleString()}`);
    console.log(`   ${reserves.tokenBSymbol || 'Token B'}: ${reserves.tokenBReserve.toLocaleString()}`);
    
    console.log('\n🏊 Liquidity Pool Details:');
    console.log(`   LP Mint: ${reserves.lpMint || 'N/A'}`);
    console.log(`   LP Supply: ${reserves.lpSupply || 'N/A'}`);
    console.log(`   Pool Status: ${reserves.poolStatus || 'Unknown'}`);
    console.log(`   Swap Fee: ${reserves.feeInfo || 'N/A'}`);
    
    if (reserves.tvlUSD && reserves.tvlUSD > 0) {
      console.log(`\n💰 Total Value Locked (TVL): $${reserves.tvlUSD.toLocaleString()}`);
    } else {
      console.log('\n💰 TVL: Not available (price data not integrated yet)');
    }

    // Validation checks
    console.log('\n🔍 Validation:');
    
    const isValid = 
      reserves.tokenAReserve > 0 &&
      reserves.tokenBReserve > 0 &&
      reserves.tokenAMint !== 'placeholder_mint_a' &&
      reserves.tokenBMint !== 'placeholder_mint_b' &&
      reserves.lpMint !== 'placeholder_lp_mint';

    if (isValid) {
      console.log('   ✅ All reserve values are non-zero');
      console.log('   ✅ Token mint addresses are real (not placeholders)');
      console.log('   ✅ LP mint address is valid');
      console.log('\n🎉 TEST PASSED: Raydium parser is working correctly!');
      return true;
    } else {
      console.error('   ❌ FAIL: Some values are still placeholders or zero');
      console.error('   ❌ Parser may not be working correctly');
      return false;
    }

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
  console.log('\n🚀 RAYDIUM PARSER TEST SUITE');
  console.log('=' .repeat(80));
  console.log('This script tests the Raydium SDK integration');
  console.log('It will parse real pool data from Solana mainnet');
  console.log('=' .repeat(80));

  const results: { pool: string; success: boolean }[] = [];

  // Test each pool
  for (const [poolName, poolAddress] of Object.entries(KNOWN_RAYDIUM_POOLS)) {
    const success = await testPoolParsing(poolName, poolAddress);
    results.push({ pool: poolName, success });
    
    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

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
    console.log('\n🎉 ALL TESTS PASSED! Raydium parser is working perfectly!');
    console.log('✅ You can now proceed to the next phase of development.');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Please review the errors above.');
    console.log('💡 Common issues:');
    console.log('   - HELIUS_API_KEY not set in .env file');
    console.log('   - Network connectivity issues');
    console.log('   - Raydium SDK version mismatch');
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

