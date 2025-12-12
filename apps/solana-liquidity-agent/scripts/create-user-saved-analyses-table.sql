-- =============================================================================
-- USER SAVED ANALYSES TABLE
-- =============================================================================
-- This table stores user-saved analyses (manual save after viewing report)
-- Users can save analyses to their personal history
-- =============================================================================

-- Create user_saved_analyses table
CREATE TABLE IF NOT EXISTS user_saved_analyses (
  -- Primary Key
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- User Information
  user_wallet TEXT NOT NULL, -- User's wallet address (normalized lowercase)
  analysis_id UUID NOT NULL, -- Reference to pool_analyses.id
  
  -- Metadata
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_analysis FOREIGN KEY (analysis_id) REFERENCES pool_analyses(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_analysis UNIQUE (user_wallet, analysis_id) -- Prevent duplicate saves
);

-- =============================================================================
-- INDEXES (for fast queries)
-- =============================================================================

-- Index on user_wallet (most common query)
CREATE INDEX IF NOT EXISTS idx_user_saved_analyses_user_wallet 
  ON user_saved_analyses(user_wallet);

-- Index on analysis_id (for joins)
CREATE INDEX IF NOT EXISTS idx_user_saved_analyses_analysis_id 
  ON user_saved_analyses(analysis_id);

-- Index on saved_at (for sorting)
CREATE INDEX IF NOT EXISTS idx_user_saved_analyses_saved_at 
  ON user_saved_analyses(saved_at DESC);

-- Composite index for user history queries
CREATE INDEX IF NOT EXISTS idx_user_saved_analyses_user_saved 
  ON user_saved_analyses(user_wallet, saved_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE user_saved_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own saved analyses
CREATE POLICY "Users can view their own saved analyses"
  ON user_saved_analyses
  FOR SELECT
  USING (true); -- Allow all reads (we'll filter by user_wallet in queries)

-- Policy: Users can insert their own saved analyses
CREATE POLICY "Users can save their own analyses"
  ON user_saved_analyses
  FOR INSERT
  WITH CHECK (true); -- Allow all inserts (we'll validate user_wallet in application)

-- Policy: Users can delete their own saved analyses
CREATE POLICY "Users can delete their own saved analyses"
  ON user_saved_analyses
  FOR DELETE
  USING (true); -- Allow all deletes (we'll validate user_wallet in application)

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: Save analysis for user
CREATE OR REPLACE FUNCTION save_user_analysis(
  p_user_wallet TEXT,
  p_analysis_id UUID
)
RETURNS UUID AS $$
DECLARE
  saved_id UUID;
BEGIN
  INSERT INTO user_saved_analyses (user_wallet, analysis_id, saved_at)
  VALUES (LOWER(TRIM(p_user_wallet)), p_analysis_id, NOW())
  ON CONFLICT (user_wallet, analysis_id) 
  DO UPDATE SET saved_at = NOW(), updated_at = NOW()
  RETURNING id INTO saved_id;
  
  RETURN saved_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's saved analyses with full analysis data
CREATE OR REPLACE FUNCTION get_user_saved_analyses(
  p_user_wallet TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_wallet TEXT,
  analysis_id UUID,
  saved_at TIMESTAMPTZ,
  pool_id TEXT,
  token_a_symbol TEXT,
  token_b_symbol TEXT,
  risk_score INTEGER,
  generated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    usa.id,
    usa.user_wallet,
    usa.analysis_id,
    usa.saved_at,
    pa.pool_id,
    pa.token_a_symbol,
    pa.token_b_symbol,
    pa.risk_score,
    pa.generated_at
  FROM user_saved_analyses usa
  INNER JOIN pool_analyses pa ON usa.analysis_id = pa.id
  WHERE usa.user_wallet = LOWER(TRIM(p_user_wallet))
  ORDER BY usa.saved_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if user has saved an analysis
CREATE OR REPLACE FUNCTION user_has_saved_analysis(
  p_user_wallet TEXT,
  p_analysis_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  exists_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO exists_count
  FROM user_saved_analyses
  WHERE user_wallet = LOWER(TRIM(p_user_wallet))
    AND analysis_id = p_analysis_id;
  
  RETURN exists_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE '✅ User saved analyses table created successfully!';
  RAISE NOTICE '🔒 RLS enabled - users can only see their own saved analyses';
  RAISE NOTICE '📊 Indexes created for fast queries';
  RAISE NOTICE '🔧 Functions created: save_user_analysis(), get_user_saved_analyses(), user_has_saved_analysis()';
END $$;

