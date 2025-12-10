-- Supabase Schema for Multi-Protocol The Graph Analytics
-- Run this in your Supabase SQL Editor AFTER running the base schema
-- This adds multi-protocol support columns

-- ============================================
-- UPDATE EXISTING TABLES FOR MULTI-PROTOCOL
-- ============================================

-- Add protocol columns to graph_pools
ALTER TABLE graph_pools 
ADD COLUMN IF NOT EXISTS protocol TEXT,
ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'ethereum',
ADD COLUMN IF NOT EXISTS subgraph_name TEXT,
ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Update unique constraint for multi-protocol
ALTER TABLE graph_pools DROP CONSTRAINT IF EXISTS graph_pools_pool_id_fetched_at_key;
ALTER TABLE graph_pools ADD CONSTRAINT graph_pools_unique UNIQUE(pool_id, protocol, network, fetched_at);

-- Add indexes for protocol queries
CREATE INDEX IF NOT EXISTS idx_graph_pools_protocol ON graph_pools(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_pools_network ON graph_pools(network);
CREATE INDEX IF NOT EXISTS idx_graph_pools_raw_data ON graph_pools USING GIN(raw_data);

-- ============================================
-- NEW TABLES FOR NFT AND LENDING
-- ============================================

-- NFT Orders table
CREATE TABLE IF NOT EXISTS graph_nft_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'ethereum',
  subgraph_name TEXT,
  offerer TEXT,
  order_status TEXT,
  order_fulfilled_at TEXT,
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, protocol, network, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_graph_nft_orders_order_id ON graph_nft_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_graph_nft_orders_protocol ON graph_nft_orders(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_nft_orders_network ON graph_nft_orders(network);
CREATE INDEX IF NOT EXISTS idx_graph_nft_orders_fetched_at ON graph_nft_orders(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nft_orders_raw_data ON graph_nft_orders USING GIN(raw_data);

-- Lending Pools table
CREATE TABLE IF NOT EXISTS graph_lending_pools (
  id BIGSERIAL PRIMARY KEY,
  pool_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'ethereum',
  subgraph_name TEXT,
  pool_name TEXT,
  pool_symbol TEXT,
  total_value_locked_usd TEXT,
  total_liquidity_usd TEXT,
  total_borrows_usd TEXT,
  liquidity_rate TEXT,
  borrow_rate TEXT,
  stable_borrow_rate TEXT,
  created_at_timestamp TEXT,
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pool_id, protocol, network, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_graph_lending_pools_pool_id ON graph_lending_pools(pool_id);
CREATE INDEX IF NOT EXISTS idx_graph_lending_pools_protocol ON graph_lending_pools(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_lending_pools_network ON graph_lending_pools(network);
CREATE INDEX IF NOT EXISTS idx_graph_lending_pools_fetched_at ON graph_lending_pools(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_lending_pools_raw_data ON graph_lending_pools USING GIN(raw_data);

-- ============================================
-- UPDATE FEATURES TABLE FOR MULTI-PROTOCOL
-- ============================================

ALTER TABLE graph_features 
ADD COLUMN IF NOT EXISTS protocol TEXT,
ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'ethereum';

CREATE INDEX IF NOT EXISTS idx_graph_features_protocol ON graph_features(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_features_network ON graph_features(network);

-- ============================================
-- UPDATE ANOMALIES TABLE FOR MULTI-PROTOCOL
-- ============================================

ALTER TABLE graph_anomalies 
ADD COLUMN IF NOT EXISTS protocol TEXT,
ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'ethereum';

CREATE INDEX IF NOT EXISTS idx_graph_anomalies_protocol ON graph_anomalies(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_anomalies_network ON graph_anomalies(network);





































