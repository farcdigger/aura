-- ============================================
-- GMX DERIVATIVES TABLE - MAIN SETUP
-- ============================================
-- Run this first in your Supabase SQL Editor
-- This creates the main table and indexes for GMX perpetuals data

-- Drop existing table if you want fresh start (CAREFUL!)
-- DROP TABLE IF EXISTS graph_derivatives_data CASCADE;

-- ============================================
-- MAIN TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS graph_derivatives_data (
  id BIGSERIAL PRIMARY KEY,
  entry_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'swap', 'positionSnapshot', 'liquidation', 'position'
  protocol TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'arbitrum',
  subgraph_name TEXT,
  
  -- Common fields
  timestamp BIGINT,
  account_id TEXT,
  asset_symbol TEXT,
  hash TEXT,
  
  -- Swap fields
  token_in TEXT,
  token_out TEXT,
  amount_in_usd NUMERIC,
  amount_out_usd NUMERIC,
  
  -- Position Snapshot fields
  balance TEXT,
  balance_usd NUMERIC,
  collateral_balance TEXT,
  collateral_balance_usd NUMERIC,
  position_side TEXT, -- 'LONG' or 'SHORT'
  
  -- Liquidation fields
  amount TEXT,
  amount_usd NUMERIC,
  profit_usd NUMERIC,
  
  -- Position fields
  block_number BIGINT,
  
  -- Raw data storage
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint
  UNIQUE(entry_id, entity_type, protocol, network, fetched_at)
);

-- ============================================
-- INDEXES (for performance)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_derivatives_entity_type ON graph_derivatives_data(entity_type);
CREATE INDEX IF NOT EXISTS idx_derivatives_protocol ON graph_derivatives_data(protocol);
CREATE INDEX IF NOT EXISTS idx_derivatives_network ON graph_derivatives_data(network);
CREATE INDEX IF NOT EXISTS idx_derivatives_timestamp ON graph_derivatives_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_derivatives_account_id ON graph_derivatives_data(account_id);
CREATE INDEX IF NOT EXISTS idx_derivatives_asset_symbol ON graph_derivatives_data(asset_symbol);
CREATE INDEX IF NOT EXISTS idx_derivatives_position_side ON graph_derivatives_data(position_side);
CREATE INDEX IF NOT EXISTS idx_derivatives_fetched_at ON graph_derivatives_data(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_derivatives_raw_data ON graph_derivatives_data USING GIN(raw_data);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_derivatives_type_protocol ON graph_derivatives_data(entity_type, protocol);
CREATE INDEX IF NOT EXISTS idx_derivatives_type_asset ON graph_derivatives_data(entity_type, asset_symbol) WHERE asset_symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_derivatives_side_asset ON graph_derivatives_data(position_side, asset_symbol) WHERE position_side IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_derivatives_account_timestamp ON graph_derivatives_data(account_id, timestamp DESC) WHERE account_id IS NOT NULL;

-- ============================================
-- HELPFUL VIEWS FOR QUERIES
-- ============================================

-- View: Recent Liquidations (last 7 days)
CREATE OR REPLACE VIEW recent_liquidations AS
SELECT 
  entry_id,
  timestamp,
  account_id,
  asset_symbol,
  amount_usd,
  profit_usd,
  hash,
  fetched_at
FROM graph_derivatives_data
WHERE entity_type = 'liquidation'
  AND fetched_at >= NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- View: Open Interest by Asset (latest snapshot per account)
CREATE OR REPLACE VIEW current_open_interest AS
WITH latest_snapshots AS (
  SELECT 
    account_id,
    asset_symbol,
    position_side,
    balance_usd,
    ROW_NUMBER() OVER (PARTITION BY account_id, asset_symbol, position_side ORDER BY timestamp DESC) as rn
  FROM graph_derivatives_data
  WHERE entity_type = 'positionSnapshot'
    AND balance_usd > 0
    AND fetched_at >= NOW() - INTERVAL '1 day'
)
SELECT 
  asset_symbol,
  position_side,
  COUNT(DISTINCT account_id) as position_count,
  SUM(balance_usd) as total_usd
FROM latest_snapshots
WHERE rn = 1
GROUP BY asset_symbol, position_side
ORDER BY total_usd DESC;

-- View: Top Traders by Activity
CREATE OR REPLACE VIEW top_traders AS
SELECT 
  account_id,
  COUNT(DISTINCT CASE WHEN entity_type = 'positionSnapshot' THEN entry_id END) as position_updates,
  COUNT(DISTINCT CASE WHEN entity_type = 'swap' THEN entry_id END) as swap_count,
  COUNT(DISTINCT CASE WHEN entity_type = 'liquidation' THEN entry_id END) as liquidation_count,
  SUM(CASE WHEN entity_type = 'swap' THEN amount_in_usd ELSE 0 END) as total_swap_volume_usd
FROM graph_derivatives_data
WHERE fetched_at >= NOW() - INTERVAL '7 days'
  AND account_id IS NOT NULL
GROUP BY account_id
ORDER BY total_swap_volume_usd DESC
LIMIT 100;

-- View: Long vs Short Ratio
CREATE OR REPLACE VIEW long_short_ratio AS
WITH ranked_positions AS (
  SELECT 
    account_id,
    asset_symbol,
    position_side,
    balance_usd,
    timestamp,
    ROW_NUMBER() OVER (PARTITION BY account_id, asset_symbol, position_side ORDER BY timestamp DESC) as rn
  FROM graph_derivatives_data
  WHERE entity_type = 'positionSnapshot'
    AND balance_usd > 0
    AND fetched_at >= NOW() - INTERVAL '1 day'
),
latest_positions AS (
  SELECT 
    asset_symbol,
    position_side,
    balance_usd
  FROM ranked_positions
  WHERE rn = 1
)
SELECT 
  asset_symbol,
  SUM(CASE WHEN position_side = 'LONG' THEN balance_usd ELSE 0 END) as long_usd,
  SUM(CASE WHEN position_side = 'SHORT' THEN balance_usd ELSE 0 END) as short_usd,
  COUNT(CASE WHEN position_side = 'LONG' THEN 1 END) as long_count,
  COUNT(CASE WHEN position_side = 'SHORT' THEN 1 END) as short_count,
  ROUND(
    100.0 * SUM(CASE WHEN position_side = 'LONG' THEN balance_usd ELSE 0 END) / 
    NULLIF(SUM(balance_usd), 0), 
    2
  ) as long_percentage
FROM latest_positions
GROUP BY asset_symbol
ORDER BY (long_usd + short_usd) DESC;

-- ============================================
-- USAGE EXAMPLES
-- ============================================

-- Query 1: Get recent swaps
-- SELECT * FROM graph_derivatives_data 
-- WHERE entity_type = 'swap' 
-- ORDER BY timestamp DESC 
-- LIMIT 100;

-- Query 2: Get liquidations in last 24h
-- SELECT * FROM recent_liquidations 
-- WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours');

-- Query 3: Current open interest
-- SELECT * FROM current_open_interest;

-- Query 4: Top 10 traders
-- SELECT * FROM top_traders LIMIT 10;

-- Query 5: Long/Short ratio by asset
-- SELECT * FROM long_short_ratio;

