-- Supabase Schema for Art Blocks NFT Data
-- Run this in your Supabase SQL Editor
-- This creates tables for Art Blocks NFT data (projects, transfers, tokens, mints)

-- ============================================
-- NFT DATA TABLE (for Art Blocks)
-- ============================================

-- General NFT data table to store projects, transfers, tokens, and mints
CREATE TABLE IF NOT EXISTS graph_nft_data (
  id BIGSERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'project', 'transfer', 'token', 'mint'
  protocol TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'ethereum',
  subgraph_name TEXT,
  
  -- Project fields
  project_id TEXT,
  project_name TEXT,
  artist_name TEXT,
  invocations TEXT,
  max_invocations TEXT,
  price_per_token_wei TEXT,
  currency_symbol TEXT,
  active BOOLEAN,
  complete BOOLEAN,
  
  -- Transfer fields
  transfer_from TEXT,
  transfer_to TEXT,
  block_number TEXT,
  block_timestamp TEXT,
  transaction_hash TEXT,
  
  -- Token fields
  token_id TEXT,
  owner_address TEXT,
  transfer_count INTEGER,
  
  -- Mint fields (PrimaryPurchase)
  minter_address TEXT,
  currency_address TEXT,
  currency_decimals INTEGER,
  
  -- Raw data storage
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: entity_id + entity_type + protocol + network + fetched_at
  UNIQUE(entity_id, entity_type, protocol, network, fetched_at)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_entity_type ON graph_nft_data(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_protocol ON graph_nft_data(protocol);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_network ON graph_nft_data(network);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_project_id ON graph_nft_data(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_token_id ON graph_nft_data(token_id);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_block_timestamp ON graph_nft_data(block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_fetched_at ON graph_nft_data(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_raw_data ON graph_nft_data USING GIN(raw_data);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_type_protocol ON graph_nft_data(entity_type, protocol);
CREATE INDEX IF NOT EXISTS idx_graph_nft_data_project_token ON graph_nft_data(project_id, token_id) WHERE project_id IS NOT NULL AND token_id IS NOT NULL;

