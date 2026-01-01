-- Fix NULL constraint issues for graph_pools table
-- Run this in your Supabase SQL Editor

-- Make token fields nullable (some pools might not have complete token info)
ALTER TABLE graph_pools 
ALTER COLUMN token0_id DROP NOT NULL,
ALTER COLUMN token0_symbol DROP NOT NULL,
ALTER COLUMN token1_id DROP NOT NULL,
ALTER COLUMN token1_symbol DROP NOT NULL;

-- Set default values for existing NULL values
UPDATE graph_pools 
SET 
  token0_symbol = COALESCE(token0_symbol, 'unknown'),
  token1_symbol = COALESCE(token1_symbol, 'unknown')
WHERE token0_symbol IS NULL OR token1_symbol IS NULL;

-- Add back NOT NULL constraint with default values
ALTER TABLE graph_pools 
ALTER COLUMN token0_symbol SET DEFAULT 'unknown',
ALTER COLUMN token1_symbol SET DEFAULT 'unknown',
ALTER COLUMN token0_symbol SET NOT NULL,
ALTER COLUMN token1_symbol SET NOT NULL;








































































