-- ============================================
-- FIX: GMX DERIVATIVES TABLE
-- ============================================
-- Run this in Supabase SQL Editor to fix the schema cache error
-- This will drop the old table and create a new one with correct schema

-- Step 1: Drop old table (if exists)
DROP TABLE IF EXISTS graph_derivatives_data CASCADE;

-- Step 2: Create fresh table with all required columns
CREATE TABLE graph_derivatives_data (
  id BIGSERIAL PRIMARY KEY,
  entry_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'arbitrum',
  subgraph_name TEXT,
  
  -- Common fields
  timestamp BIGINT,
  account_id TEXT,  -- ✅ This column MUST exist
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
  position_side TEXT,
  
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

-- Step 3: Create indexes for performance
CREATE INDEX idx_derivatives_entity_type ON graph_derivatives_data(entity_type);
CREATE INDEX idx_derivatives_protocol ON graph_derivatives_data(protocol);
CREATE INDEX idx_derivatives_network ON graph_derivatives_data(network);
CREATE INDEX idx_derivatives_timestamp ON graph_derivatives_data(timestamp DESC);
CREATE INDEX idx_derivatives_account_id ON graph_derivatives_data(account_id);  -- ✅ Index for account_id
CREATE INDEX idx_derivatives_asset_symbol ON graph_derivatives_data(asset_symbol);
CREATE INDEX idx_derivatives_position_side ON graph_derivatives_data(position_side);
CREATE INDEX idx_derivatives_fetched_at ON graph_derivatives_data(fetched_at DESC);
CREATE INDEX idx_derivatives_raw_data ON graph_derivatives_data USING GIN(raw_data);

-- Composite indexes
CREATE INDEX idx_derivatives_type_protocol ON graph_derivatives_data(entity_type, protocol);
CREATE INDEX idx_derivatives_type_asset ON graph_derivatives_data(entity_type, asset_symbol) WHERE asset_symbol IS NOT NULL;
CREATE INDEX idx_derivatives_side_asset ON graph_derivatives_data(position_side, asset_symbol) WHERE position_side IS NOT NULL;
CREATE INDEX idx_derivatives_account_timestamp ON graph_derivatives_data(account_id, timestamp DESC) WHERE account_id IS NOT NULL;

-- Success message
SELECT 'Table graph_derivatives_data created successfully!' as status;

