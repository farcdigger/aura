-- =============================================================================
-- MULTI-CHAIN SUPPORT MIGRATION
-- =============================================================================
-- Add network column to pool_analyses table to support Base and BSC networks
-- Run this script in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste & Run
-- =============================================================================

-- Add network column to pool_analyses table
ALTER TABLE pool_analyses 
ADD COLUMN IF NOT EXISTS network VARCHAR(10) DEFAULT 'solana' NOT NULL;

-- Create index on network column for fast queries
CREATE INDEX IF NOT EXISTS idx_pool_analyses_network 
  ON pool_analyses(network);

-- Update existing records to have 'solana' network (if not already set)
UPDATE pool_analyses 
SET network = 'solana' 
WHERE network IS NULL OR network = '';

-- Add composite index for pool_id + network (for network-specific queries)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_pool_id_network 
  ON pool_analyses(pool_id, network);

-- Add composite index for network + generated_at (for network-specific recent analyses)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_network_generated_at 
  ON pool_analyses(network, generated_at DESC);

-- Add check constraint to ensure network is one of the supported values
ALTER TABLE pool_analyses
ADD CONSTRAINT check_network_value 
CHECK (network IN ('solana', 'base', 'bsc'));

-- =============================================================================
-- UPDATE VIEWS (for network-aware queries)
-- =============================================================================

-- Update recent_pool_analyses view to include network
DROP VIEW IF EXISTS recent_pool_analyses;
CREATE OR REPLACE VIEW recent_pool_analyses AS
SELECT 
  pool_id,
  network,
  token_a_symbol || '/' || token_b_symbol AS pair,
  risk_score,
  generated_at,
  model_used,
  CASE 
    WHEN risk_score <= 20 THEN 'Very Low'
    WHEN risk_score <= 40 THEN 'Low'
    WHEN risk_score <= 60 THEN 'Medium'
    WHEN risk_score <= 80 THEN 'High'
    ELSE 'Critical'
  END AS risk_level
FROM pool_analyses
WHERE generated_at > NOW() - INTERVAL '24 hours'
ORDER BY generated_at DESC;

-- Update high_risk_pools view to include network
DROP VIEW IF EXISTS high_risk_pools;
CREATE OR REPLACE VIEW high_risk_pools AS
SELECT 
  pool_id,
  network,
  token_a_symbol || '/' || token_b_symbol AS pair,
  risk_score,
  generated_at,
  analysis_report
FROM pool_analyses
WHERE risk_score > 60
ORDER BY risk_score DESC, generated_at DESC;

-- Update most_analyzed_pools view to include network
DROP VIEW IF EXISTS most_analyzed_pools;
CREATE OR REPLACE VIEW most_analyzed_pools AS
SELECT 
  pool_id,
  network,
  token_a_symbol || '/' || token_b_symbol AS pair,
  COUNT(*) as analysis_count,
  AVG(risk_score) as avg_risk_score,
  MAX(generated_at) as last_analyzed
FROM pool_analyses
GROUP BY pool_id, network, token_a_symbol, token_b_symbol
ORDER BY analysis_count DESC
LIMIT 100;

-- =============================================================================
-- HELPER FUNCTION: Get recent analysis for a pool (network-aware)
-- =============================================================================

-- Update function to support network parameter
DROP FUNCTION IF EXISTS get_recent_pool_analysis(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_recent_pool_analysis(
  p_pool_id TEXT,
  p_max_age_minutes INTEGER DEFAULT 5,
  p_network TEXT DEFAULT 'solana'
)
RETURNS TABLE (
  id UUID,
  pool_id TEXT,
  network TEXT,
  risk_score INTEGER,
  analysis_report TEXT,
  generated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.pool_id,
    pa.network,
    pa.risk_score,
    pa.analysis_report,
    pa.generated_at
  FROM pool_analyses pa
  WHERE pa.pool_id = p_pool_id
    AND pa.network = p_network
    AND pa.generated_at > NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
  ORDER BY pa.generated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VERIFICATION QUERIES (optional - run to verify migration)
-- =============================================================================

-- Check network column exists and has correct default
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'pool_analyses' AND column_name = 'network';

-- Check all records have network set
-- SELECT network, COUNT(*) 
-- FROM pool_analyses 
-- GROUP BY network;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- ✅ Network column added to pool_analyses table
-- ✅ Indexes created for network queries
-- ✅ Existing records updated to 'solana'
-- ✅ Views updated to include network
-- ✅ Function updated to support network parameter
-- =============================================================================

