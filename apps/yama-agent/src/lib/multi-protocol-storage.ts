import { getSupabaseClient } from './supabase';
import type { FetchAllProtocolsResult } from './multi-protocol-fetcher';

type DexData = Record<string, any[]>;
type LendingData = Record<string, any[]>;

const DEX_TABLE = process.env.SUPABASE_DEX_TABLE || 'graph_dex_swaps';
const LENDING_EVENT_TABLE = process.env.SUPABASE_LENDING_EVENT_TABLE || 'graph_lending_events';
const LENDING_MARKET_TABLE = process.env.SUPABASE_LENDING_MARKET_TABLE || 'graph_lending_markets';
const NFT_DATA_TABLE = process.env.SUPABASE_NFT_TABLE || 'graph_nft_data';
const DERIVATIVES_TABLE = process.env.SUPABASE_DERIVATIVES_TABLE || 'graph_derivatives_data';

async function saveDexSwaps(allDexData: DexData): Promise<void> {
  const supabase = getSupabaseClient();
  const rows: any[] = [];
  const seenSwapIds = new Set<string>();
  
  for (const [protocol, swaps] of Object.entries(allDexData)) {
    for (const swap of swaps) {
      // Skip duplicate swap_id's within the same batch
      if (seenSwapIds.has(swap.id)) {
        continue;
      }
      seenSwapIds.add(swap.id);
      
      rows.push({
        swap_id: swap.id,
        protocol: swap._protocol || protocol,
        network: swap._network || null,
        pool_id: swap.pool?.id || null,
        token0_symbol: swap.token0?.symbol || swap.pool?.token0?.symbol || null,
        token1_symbol: swap.token1?.symbol || swap.pool?.token1?.symbol || null,
        fee_tier: swap.pool?.feeTier || null,
        amount_usd: swap.amountUSD ? Number(swap.amountUSD) : null,
        amount0: swap.amount0 ? Number(swap.amount0) : null,
        amount1: swap.amount1 ? Number(swap.amount1) : null,
        timestamp: swap.timestamp ? Number(swap.timestamp) : null,
        fetched_at: new Date().toISOString(),
        raw_data: swap,
      });
    }
  }
  
  if (rows.length === 0) {
    return;
  }
  
  // Batch insert to avoid Supabase timeout (1000 rows per batch)
  const BATCH_SIZE = 1000;
  let totalSaved = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(DEX_TABLE).upsert(batch, { onConflict: 'swap_id' });
    
    if (error) {
      console.error(`[Supabase] ❌ Failed to save DEX swaps batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      throw error; // Stop on error
    } else {
      totalSaved += batch.length;
      console.log(`[Supabase] ✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} swaps (total: ${totalSaved}/${rows.length})`);
    }
  }
  
  console.log(`[Supabase] ✅ Saved ${totalSaved} DEX swaps total`);
}

async function saveLendingMarkets(data: LendingData): Promise<void> {
  const supabase = getSupabaseClient();
  const records: any[] = [];
  
  for (const [protocol, entries] of Object.entries(data)) {
    for (const entry of entries) {
      for (const market of entry.markets || []) {
        records.push({
          market_id: market.id,
          protocol: protocol,
          network: market._network || entry._network || null,
          name: market.name,
          input_token_symbol: market.inputToken?.symbol || null,
          total_value_locked_usd: market.totalValueLockedUSD ? Number(market.totalValueLockedUSD) : null,
          total_deposit_balance_usd: market.totalDepositBalanceUSD ? Number(market.totalDepositBalanceUSD) : null,
          total_borrow_balance_usd: market.totalBorrowBalanceUSD ? Number(market.totalBorrowBalanceUSD) : null,
          cumulative_borrow_usd: market.cumulativeBorrowUSD ? Number(market.cumulativeBorrowUSD) : null,
          cumulative_liquidate_usd: market.cumulativeLiquidateUSD ? Number(market.cumulativeLiquidateUSD) : null,
          rates: market.rates || [],
        fetched_at: new Date().toISOString(),
          raw_data: market,
        });
      }
    }
  }
  
  if (records.length === 0) {
    return;
  }
  
  const { error } = await supabase.from(LENDING_MARKET_TABLE).upsert(records, { onConflict: 'market_id' });
    if (error) {
    console.error('[Supabase] ❌ Failed to save lending markets:', error.message);
  } else {
    console.log(`[Supabase] ✅ Saved ${records.length} lending markets`);
}
}

async function saveLendingEvents(data: LendingData): Promise<void> {
  const supabase = getSupabaseClient();
  const rows: any[] = [];
  const seenEventIds = new Set<string>();
  
  for (const [protocol, entries] of Object.entries(data)) {
    for (const entry of entries) {
      for (const event of [...(entry.borrows || []), ...(entry.deposits || [])]) {
        // Skip duplicate event_id's within the same batch
        if (seenEventIds.has(event.id)) {
          continue;
        }
        seenEventIds.add(event.id);
        
        rows.push({
          event_id: event.id,
          protocol,
          network: event._network || entry._network || null,
          event_type: event._eventType,
          market_id: event.market?.id || null,
          market_name: event.market?.name || null,
          asset_symbol: event.asset?.symbol || null,
          amount: event.amount ? Number(event.amount) : null,
          amount_usd: event.amountUSD ? Number(event.amountUSD) : null,
          account_id: event.account?.id || null,
          timestamp: event.timestamp ? Number(event.timestamp) : null,
        fetched_at: new Date().toISOString(),
          raw_data: event,
        });
      }
    }
  }
  
  if (rows.length === 0) {
    return;
  }
  
  const { error } = await supabase.from(LENDING_EVENT_TABLE).upsert(rows, { onConflict: 'event_id' });
    if (error) {
    console.error('[Supabase] ❌ Failed to save lending events:', error.message);
    } else {
    console.log(`[Supabase] ✅ Saved ${rows.length} lending events`);
    }
  }
  
async function saveNFTData(allNFTData: Record<string, any[]>): Promise<void> {
  const supabase = getSupabaseClient();
  const rows: any[] = [];
  const seenEntityIds = new Set<string>();
  
  for (const [protocol, nftEntries] of Object.entries(allNFTData)) {
    for (const entry of nftEntries) {
      const entityType = entry._entityType || 'unknown';
      const entityId = entry.id || entry.projectId || entry.tokenId || 'unknown';
      const uniqueKey = `${entityId}-${entityType}-${protocol}`;
      
      // Skip duplicates
      if (seenEntityIds.has(uniqueKey)) {
        continue;
      }
      seenEntityIds.add(uniqueKey);
      
      const row: any = {
        entity_id: entityId,
        entity_type: entityType,
        protocol: entry._protocol || protocol,
        network: entry._network || 'ethereum',
        subgraph_name: entry._subgraphName || null,
        raw_data: entry,
        fetched_at: new Date().toISOString(),
      };
      
      // Project fields
      if (entityType === 'project') {
        row.project_id = entry.projectId;
        row.project_name = entry.name;
        row.artist_name = entry.artistName;
        row.invocations = entry.invocations?.toString();
        row.max_invocations = entry.maxInvocations?.toString();
        row.price_per_token_wei = entry.pricePerTokenInWei?.toString();
        row.currency_symbol = entry.currencySymbol;
        row.active = entry.active === true;
        row.complete = entry.complete === true;
      }
      
      // Transfer fields
      if (entityType === 'transfer') {
        row.transfer_from = entry.from;
        row.transfer_to = entry.to;
        row.block_number = entry.blockNumber?.toString();
        row.block_timestamp = entry.blockTimestamp?.toString();
        row.transaction_hash = entry.transactionHash;
        row.token_id = entry.token?.tokenId;
        row.project_id = entry.token?.project?.projectId;
        row.project_name = entry.token?.project?.name;
      }
      
      // Token fields
      if (entityType === 'token') {
        row.token_id = entry.tokenId;
        row.owner_address = entry.owner?.id;
        row.transfer_count = entry.transfers?.length || 0;
        row.project_id = entry.project?.projectId;
        row.project_name = entry.project?.name;
      }
      
      // Mint fields (PrimaryPurchase)
      if (entityType === 'mint') {
        row.token_id = entry.token?.tokenId;
        row.project_id = entry.token?.project?.projectId;
        row.project_name = entry.token?.project?.name;
        row.minter_address = entry.minterAddress;
        row.transaction_hash = entry.transactionHash;
        row.currency_address = entry.currencyAddress;
        row.currency_symbol = entry.currencySymbol;
        row.currency_decimals = entry.currencyDecimals;
      }
      
      rows.push(row);
    }
  }
  
  if (rows.length === 0) {
    return;
  }
  
  // Batch insert to avoid Supabase timeout (1000 rows per batch)
  const BATCH_SIZE = 1000;
  let totalSaved = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(NFT_DATA_TABLE)
      .upsert(batch, { 
        onConflict: 'entity_id,entity_type,protocol,network,fetched_at'
      });
    
    if (error) {
      console.error(`[Supabase] ❌ Failed to save NFT data batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      throw error;
    } else {
      totalSaved += batch.length;
      console.log(`[Supabase] ✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} NFT records (total: ${totalSaved}/${rows.length})`);
    }
  }
  
  console.log(`[Supabase] ✅ Saved ${totalSaved} NFT records total`);
}

async function saveDerivativesData(allDerivativesData: Record<string, any[]>): Promise<void> {
  const supabase = getSupabaseClient();
  const rows: any[] = [];
  const seenIds = new Set<string>();
  
  for (const [protocol, entries] of Object.entries(allDerivativesData)) {
    for (const entry of entries) {
      const entityType = entry._entityType;
      const uniqueId = `${entry.id}-${entityType}-${entry.timestamp || entry.timestampOpened || Date.now()}`;
      
      // Skip duplicates
      if (seenIds.has(uniqueId)) {
        continue;
      }
      seenIds.add(uniqueId);
      
      const row: any = {
        entry_id: entry.id,
        entity_type: entityType,
        protocol: entry._protocol || protocol,
        network: entry._network || null,
        subgraph_name: entry._subgraphName || null,
        timestamp: entry.timestamp ? Number(entry.timestamp) : entry.timestampOpened ? Number(entry.timestampOpened) : null,
        fetched_at: new Date().toISOString(),
        raw_data: entry,
      };
      
      // Common fields
      row.account_id = entry.account?.id || null;
      row.asset_symbol = entry.asset?.symbol || entry.position?.asset?.symbol || null;
      row.hash = entry.hash || null;
      
      // Entity-specific fields
      if (entityType === 'swap') {
        row.token_in = entry.tokenIn?.symbol || null;
        row.token_out = entry.tokenOut?.symbol || null;
        row.amount_in_usd = entry.amountInUSD ? Number(entry.amountInUSD) : null;
        row.amount_out_usd = entry.amountOutUSD ? Number(entry.amountOutUSD) : null;
      } else if (entityType === 'positionSnapshot') {
        row.balance = entry.balance || null;
        row.balance_usd = entry.balanceUSD ? Number(entry.balanceUSD) : null;
        row.collateral_balance = entry.collateralBalance || null;
        row.collateral_balance_usd = entry.collateralBalanceUSD ? Number(entry.collateralBalanceUSD) : null;
        row.position_side = entry.position?.side || null;
      } else if (entityType === 'liquidation') {
        row.amount = entry.amount || null;
        row.amount_usd = entry.amountUSD ? Number(entry.amountUSD) : null;
        row.profit_usd = entry.profitUSD ? Number(entry.profitUSD) : null;
      } else if (entityType === 'position') {
        row.balance = entry.balance || null;
        row.balance_usd = entry.balanceUSD ? Number(entry.balanceUSD) : null;
        row.position_side = entry.side || null;
        row.block_number = entry.blockNumberOpened ? Number(entry.blockNumberOpened) : null;
      }
      
      rows.push(row);
    }
  }
  
  if (rows.length === 0) {
    console.log('[Supabase] No derivatives data to save');
    return;
  }
  
  // Batch insert (1000 rows per batch)
  const BATCH_SIZE = 1000;
  let totalSaved = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(DERIVATIVES_TABLE)
      .upsert(batch, { 
        onConflict: 'entry_id,entity_type,protocol,network,fetched_at'
      });
    
    if (error) {
      console.error(`[Supabase] ❌ Failed to save derivatives data batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      throw error;
    } else {
      totalSaved += batch.length;
      console.log(`[Supabase] ✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} derivatives records (total: ${totalSaved}/${rows.length})`);
    }
  }
  
  console.log(`[Supabase] ✅ Saved ${totalSaved} derivatives records total`);
}

export async function saveAllProtocolsData(allData: FetchAllProtocolsResult): Promise<void> {
  try {
    await saveDexSwaps(allData.dex);
    await saveLendingMarkets(allData.lending);
    await saveLendingEvents(allData.lending);
    await saveNFTData(allData.nft);
    await saveDerivativesData(allData.derivatives);
  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to save protocol data:', error.message);
  }
}
