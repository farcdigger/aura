/**
 * Test Script: Active Raydium V4 Pool
 * 
 * Bu script aktif bir Raydium V4 pool'u test eder.
 * Gerçek kullanıcı deneyimini simüle eder.
 */

import 'dotenv/config';
import { getHeliusClient } from '../src/lib/helius-client';

const heliusClient = getHeliusClient();

// Test pool ID (kullanıcıdan alınan)
const TEST_POOL_ID = 'DwZ6Y1bCsV1SycTriRCbdPGpZbRbAn4DMT7iYMut2ZjE';

async function testActivePool() {
  console.log('🧪 ACTIVE POOL TEST');
  console.log('='.repeat(80));
  console.log('');
  console.log(`📍 Pool ID: ${TEST_POOL_ID}`);
  console.log('');

  try {
    // 1. Pool Reserves & TVL
    console.log('📋 STEP 1: Fetching Pool Reserves & TVL');
    console.log('-'.repeat(80));
    
    const reserves = await heliusClient.getPoolReserves(TEST_POOL_ID);
    
    console.log(`  💧 Pool: ${reserves.tokenASymbol}/${reserves.tokenBSymbol}`);
    console.log(`  💰 TVL: $${reserves.tvlUSD?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}`);
    console.log(`  📊 Token A: ${reserves.tokenAAmount?.toFixed(2)} ${reserves.tokenASymbol}`);
    console.log(`  📊 Token B: ${reserves.tokenBAmount?.toFixed(2)} ${reserves.tokenBSymbol}`);
    console.log(`  🏥 Status: ${reserves.poolStatus}`);
    console.log(`  💸 Fee: ${reserves.feeInfo}`);
    console.log('');

    // 2. Transaction History (1000 transactions like production)
    console.log('📋 STEP 2: Fetching Transaction History (Production Limit: 1000)');
    console.log('-'.repeat(80));
    
    const startTime = Date.now();
    const transactions = await heliusClient.getTransactionHistory(TEST_POOL_ID, 1000);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`  ⏱️  Fetch Duration: ${duration}s`);
    console.log(`  📊 Total Transactions: ${transactions.totalCount}`);
    console.log(`  📈 Buy Transactions: ${transactions.buyCount} (${((transactions.buyCount / transactions.totalCount) * 100).toFixed(1)}%)`);
    console.log(`  📉 Sell Transactions: ${transactions.sellCount} (${((transactions.sellCount / transactions.totalCount) * 100).toFixed(1)}%)`);
    console.log(`  👥 Unique Wallets: ${transactions.uniqueWallets || 0}`);
    console.log('');

    // 3. Trading Patterns
    console.log('📋 STEP 3: Trading Pattern Analysis');
    console.log('-'.repeat(80));
    
    if (transactions.suspiciousPatterns && transactions.suspiciousPatterns.length > 0) {
      console.log(`  ⚠️  Suspicious Patterns Detected: ${transactions.suspiciousPatterns.length}`);
      transactions.suspiciousPatterns.forEach((pattern, idx) => {
        console.log(`    ${idx + 1}. ${pattern}`);
      });
    } else {
      console.log('  ✅ No suspicious patterns detected');
    }
    console.log('');

    // 4. Top Traders
    if (transactions.topTraders && transactions.topTraders.length > 0) {
      console.log('📋 STEP 4: Top Traders');
      console.log('-'.repeat(80));
      
      transactions.topTraders.slice(0, 5).forEach((trader, idx) => {
        const totalTrades = trader.buyCount + trader.sellCount;
        console.log(`  ${idx + 1}. ${trader.wallet.substring(0, 8)}...`);
        console.log(`     Trades: ${totalTrades} (${trader.buyCount} buys, ${trader.sellCount} sells)`);
        console.log(`     Volume: $${trader.volume.toLocaleString()}`);
      });
      console.log('');
    }

    // 5. Data Quality Assessment
    console.log('📋 STEP 5: Data Quality Assessment');
    console.log('-'.repeat(80));
    
    let qualityScore = 0;
    const checks: string[] = [];
    
    // Check 1: TVL > 0
    if (reserves.tvlUSD && reserves.tvlUSD > 0) {
      qualityScore += 20;
      checks.push('✅ TVL calculated');
    } else {
      checks.push('❌ TVL missing or $0');
    }
    
    // Check 2: Enough transactions
    if (transactions.totalCount >= 50) {
      qualityScore += 20;
      checks.push(`✅ Sufficient transactions (${transactions.totalCount})`);
    } else {
      checks.push(`⚠️  Low transaction count (${transactions.totalCount})`);
    }
    
    // Check 3: Buy/Sell balance
    const buyRatio = transactions.buyCount / transactions.totalCount;
    if (buyRatio >= 0.3 && buyRatio <= 0.7) {
      qualityScore += 20;
      checks.push('✅ Balanced buy/sell ratio');
    } else if (buyRatio > 0 && buyRatio < 1) {
      qualityScore += 10;
      checks.push('⚠️  Imbalanced buy/sell ratio');
    } else {
      checks.push('❌ Extreme buy/sell ratio');
    }
    
    // Check 4: Unique wallets
    if (transactions.uniqueWallets && transactions.uniqueWallets >= 10) {
      qualityScore += 20;
      checks.push(`✅ Good wallet diversity (${transactions.uniqueWallets})`);
    } else {
      checks.push(`⚠️  Low wallet diversity (${transactions.uniqueWallets || 0})`);
    }
    
    // Check 5: Pool status
    if (reserves.poolStatus === 'Active') {
      qualityScore += 20;
      checks.push('✅ Pool is active');
    } else {
      checks.push(`⚠️  Pool status: ${reserves.poolStatus}`);
    }
    
    checks.forEach(check => console.log(`  ${check}`));
    console.log('');
    console.log(`  📊 Data Quality Score: ${qualityScore}/100`);
    console.log('');

    // 6. Final Assessment
    console.log('='.repeat(80));
    console.log('');
    
    if (qualityScore >= 80 && transactions.totalCount >= 100) {
      console.log('🎉 ✅ EXCELLENT! This pool is perfect for AI analysis!');
      console.log('');
      console.log('📝 Analysis will include:');
      console.log(`  • Rich transaction history (${transactions.totalCount} swaps)`);
      console.log(`  • Accurate TVL ($${reserves.tvlUSD?.toLocaleString()})`);
      console.log(`  • Whale detection (${transactions.uniqueWallets} unique wallets)`);
      console.log(`  • Pattern recognition (${transactions.suspiciousPatterns?.length || 0} flags)`);
      console.log('');
      console.log('✅ Ready for full E2E test with this pool!');
    } else if (qualityScore >= 60 || transactions.totalCount >= 20) {
      console.log('✅ GOOD! This pool can be analyzed, but data may be limited.');
      console.log('');
      console.log('💡 Recommendations:');
      if (transactions.totalCount < 50) {
        console.log('  • Low transaction count - analysis may lack depth');
      }
      if (qualityScore < 80) {
        console.log('  • Some data quality issues detected');
      }
      console.log('');
      console.log('✅ Can still proceed with E2E test');
    } else {
      console.log('⚠️  WARNING! This pool has limited data.');
      console.log('');
      console.log('❌ Issues:');
      if (transactions.totalCount < 20) {
        console.log('  • Very few transactions');
      }
      if (!reserves.tvlUSD || reserves.tvlUSD === 0) {
        console.log('  • TVL cannot be calculated');
      }
      console.log('');
      console.log('💡 Recommend finding a more active pool');
    }

  } catch (error: any) {
    console.error('');
    console.error('❌ TEST FAILED!');
    console.error('');
    console.error(`Error: ${error.message}`);
    console.error('');
    
    if (error.message.includes('Pool account not found')) {
      console.error('💡 This may not be a valid Raydium AMM V4 pool address.');
      console.error('   Try another pool from: https://raydium.io/liquidity-pools/');
    }
    
    process.exit(1);
  }
}

// Run test
testActivePool();

