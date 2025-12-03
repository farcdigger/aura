-- =============================================================================
-- SOLANA LIQUIDITY AGENT - SUPABASE SCHEMA
-- =============================================================================
-- Run this script in Supabase SQL Editor to create the required tables
-- Dashboard → SQL Editor → New Query → Paste & Run
-- =============================================================================

-- Drop existing table if you want to reset (BE CAREFUL!)
-- DROP TABLE IF EXISTS pool_analyses CASCADE;

-- =============================================================================
-- MAIN TABLE: pool_analyses
-- =============================================================================

CREATE TABLE IF NOT EXISTS pool_analyses (
  -- Primary Key
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Pool Information
  pool_id TEXT NOT NULL,
  token_a_mint TEXT NOT NULL,
  token_a_symbol TEXT NOT NULL,
  token_b_mint TEXT NOT NULL,
  token_b_symbol TEXT NOT NULL,
  
  -- Analysis Results
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  analysis_report TEXT NOT NULL,
  
  -- Snapshots (JSONB for flexible storage)
  reserves_snapshot JSONB,
  transaction_summary JSONB,
  
  -- Metadata
  model_used TEXT,
  tokens_used INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- User Tracking (Optional)
  user_id TEXT,
  user_wallet TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES (for fast queries)
-- =============================================================================

-- Index on pool_id (most common query)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_pool_id 
  ON pool_analyses(pool_id);

-- Index on generated_at (for cache checks)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_generated_at 
  ON pool_analyses(generated_at DESC);

-- Index on risk_score (for filtering high-risk pools)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_risk_score 
  ON pool_analyses(risk_score);

-- Composite index for pool_id + generated_at (cache queries)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_pool_id_generated_at 
  ON pool_analyses(pool_id, generated_at DESC);

-- Index on user_id (for user history)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_user_id 
  ON pool_analyses(user_id) 
  WHERE user_id IS NOT NULL;

-- =============================================================================
-- VIEWS (for convenient queries)
-- =============================================================================

-- Recent analyses (last 24 hours)
CREATE OR REPLACE VIEW recent_pool_analyses AS
SELECT 
  pool_id,
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

-- High risk pools (risk score > 60)
CREATE OR REPLACE VIEW high_risk_pools AS
SELECT 
  pool_id,
  token_a_symbol || '/' || token_b_symbol AS pair,
  risk_score,
  generated_at,
  analysis_report
FROM pool_analyses
WHERE risk_score > 60
ORDER BY risk_score DESC, generated_at DESC;

-- Most analyzed pools (popular pools)
CREATE OR REPLACE VIEW most_analyzed_pools AS
SELECT 
  pool_id,
  token_a_symbol || '/' || token_b_symbol AS pair,
  COUNT(*) as analysis_count,
  AVG(risk_score) as avg_risk_score,
  MAX(generated_at) as last_analyzed
FROM pool_analyses
GROUP BY pool_id, token_a_symbol, token_b_symbol
ORDER BY analysis_count DESC
LIMIT 100;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - Optional
-- =============================================================================

-- Enable RLS (uncomment if you want user-level access control)
-- ALTER TABLE pool_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (backend)
-- CREATE POLICY "Service role has full access" 
--   ON pool_analyses 
--   FOR ALL 
--   USING (auth.role() = 'service_role');

-- Policy: Users can view their own analyses
-- CREATE POLICY "Users can view own analyses" 
--   ON pool_analyses 
--   FOR SELECT 
--   USING (auth.uid()::TEXT = user_id);

-- Policy: Allow anonymous read for public analyses (if user_id is null)
-- CREATE POLICY "Public analyses are readable" 
--   ON pool_analyses 
--   FOR SELECT 
--   USING (user_id IS NULL);

-- =============================================================================
-- FUNCTIONS (Helper utilities)
-- =============================================================================

-- Function: Get most recent analysis for a pool
CREATE OR REPLACE FUNCTION get_recent_pool_analysis(
  p_pool_id TEXT,
  p_max_age_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pool_id TEXT,
  risk_score INTEGER,
  analysis_report TEXT,
  generated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.pool_id,
    pa.risk_score,
    pa.analysis_report,
    pa.generated_at
  FROM pool_analyses pa
  WHERE pa.pool_id = p_pool_id
    AND pa.generated_at > NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
  ORDER BY pa.generated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Update timestamp on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS update_pool_analyses_updated_at ON pool_analyses;
CREATE TRIGGER update_pool_analyses_updated_at
  BEFORE UPDATE ON pool_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SAMPLE QUERIES (for testing)
-- =============================================================================

-- Check if table exists
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_name = 'pool_analyses'
-- );

-- Count total analyses
-- SELECT COUNT(*) FROM pool_analyses;

-- Get recent analyses
-- SELECT * FROM recent_pool_analyses LIMIT 10;

-- Get high risk pools
-- SELECT * FROM high_risk_pools LIMIT 10;

-- Get most analyzed pools
-- SELECT * FROM most_analyzed_pools LIMIT 10;

-- Test the helper function
-- SELECT * FROM get_recent_pool_analysis('YOUR_POOL_ID', 5);

-- =============================================================================
-- CLEANUP (Optional - BE VERY CAREFUL!)
-- =============================================================================

-- Delete old analyses (older than 30 days)
-- DELETE FROM pool_analyses 
-- WHERE generated_at < NOW() - INTERVAL '30 days';

-- =============================================================================
-- GRANTS (if needed for different roles)
-- =============================================================================

-- Grant access to authenticated users (if using RLS)
-- GRANT SELECT ON pool_analyses TO authenticated;
-- GRANT SELECT ON recent_pool_analyses TO authenticated;
-- GRANT SELECT ON high_risk_pools TO authenticated;
-- GRANT SELECT ON most_analyzed_pools TO authenticated;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE '✅ Supabase schema setup complete!'; 
  RAISE NOTICE '📊 Tables: pool_analyses';
  RAISE NOTICE '📈 Views: recent_pool_analyses, high_risk_pools, most_analyzed_pools';
  RAISE NOTICE '🔧 Functions: get_recent_pool_analysis()';
  RAISE NOTICE '🎯 Ready to store pool analyses!';
END $$;




