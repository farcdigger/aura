// apps/solana-liquidity-agent/scripts/debug-pool-state.ts

/**
 * Debug script to inspect Raydium pool state structure
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4 } from '@raydium-io/raydium-sdk';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'; // SOL/USDC

async function debugPoolState() {
  console.log('🔍 DEBUG: Raydium Pool State Structure\n');
  
  try {
    // Connect to Solana
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
    
    // Fetch pool account
    console.log(`📡 Fetching pool: ${TEST_POOL}`);
    const poolPubkey = new PublicKey(TEST_POOL);
    const accountInfo = await connection.getAccountInfo(poolPubkey);
    
    if (!accountInfo || !accountInfo.data) {
      throw new Error('Pool account not found');
    }
    
    console.log(`✅ Account data size: ${accountInfo.data.length} bytes\n`);
    
    // Decode pool state
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.data);
    
    console.log('📊 POOL STATE STRUCTURE:\n');
    console.log('All keys:', Object.keys(poolState).join(', '));
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Inspect critical fields
    const criticalFields = [
      'status', 'baseMint', 'quoteMint', 'lpMint',
      'baseDecimal', 'quoteDecimal',
      'baseVault', 'quoteVault', 'lpReserve',
      'swapFeeNumerator', 'swapFeeDenominator',
      'baseNeedTakePnl', 'quoteNeedTakePnl'
    ];
    
    for (const field of criticalFields) {
      const value = (poolState as any)[field];
      
      console.log(`\n📌 ${field}:`);
      console.log(`   Type: ${typeof value}`);
      console.log(`   Value: ${value}`);
      console.log(`   Constructor: ${value?.constructor?.name || 'N/A'}`);
      
      if (value && typeof value === 'object') {
        console.log(`   Object keys: ${Object.keys(value).join(', ')}`);
        
        // Try toString()
        try {
          const strVal = value.toString();
          console.log(`   toString(): ${strVal}`);
        } catch (e: any) {
          console.log(`   toString() ERROR: ${e.message}`);
        }
        
        // Try toNumber() if it exists
        if (typeof value.toNumber === 'function') {
          try {
            console.log(`   toNumber(): ${value.toNumber()}`);
          } catch (e: any) {
            console.log(`   toNumber() ERROR: ${e.message}`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    console.log('✅ Debug complete!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugPoolState();

