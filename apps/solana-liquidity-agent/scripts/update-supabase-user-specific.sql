-- =============================================================================
-- USER-SPECIFIC REPORTS UPDATE
-- =============================================================================
-- Raporları kullanıcı bazlı yapmak için gerekli güncellemeler
-- =============================================================================

-- 1. user_wallet için index ekle (hızlı sorgu için)
CREATE INDEX IF NOT EXISTS idx_pool_analyses_user_wallet 
  ON pool_analyses(user_wallet) 
  WHERE user_wallet IS NOT NULL;

-- 2. Composite index: user_wallet + generated_at
CREATE INDEX IF NOT EXISTS idx_pool_analyses_user_wallet_generated_at 
  ON pool_analyses(user_wallet, generated_at DESC) 
  WHERE user_wallet IS NOT NULL;

-- 3. RLS (Row Level Security) aktif et
ALTER TABLE pool_analyses ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Service role (backend) tam erişim
CREATE POLICY "Service role full access" 
  ON pool_analyses 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Policy: Kullanıcılar sadece kendi raporlarını görebilir
CREATE POLICY "Users see only their own reports" 
  ON pool_analyses 
  FOR SELECT 
  TO authenticated, anon
  USING (
    user_wallet IS NULL OR  -- Public reports (eğer varsa)
    user_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

-- 6. View: User's own reports
CREATE OR REPLACE VIEW user_pool_analyses AS
SELECT 
  id,
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
  END AS risk_level,
  user_wallet
FROM pool_analyses
WHERE user_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address'
ORDER BY generated_at DESC;

-- 7. Function: Get user's report history
CREATE OR REPLACE FUNCTION get_user_report_history(
  p_user_wallet TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  pool_id TEXT,
  pair TEXT,
  risk_score INTEGER,
  generated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.pool_id,
    pa.token_a_symbol || '/' || pa.token_b_symbol AS pair,
    pa.risk_score,
    pa.generated_at
  FROM pool_analyses pa
  WHERE pa.user_wallet = p_user_wallet
  ORDER BY pa.generated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 8. Function: Check if user already analyzed this pool (son 24 saat)
CREATE OR REPLACE FUNCTION user_has_recent_analysis(
  p_user_wallet TEXT,
  p_pool_id TEXT,
  p_max_age_hours INTEGER DEFAULT 24
)
RETURNS BOOLEAN AS $$
DECLARE
  analysis_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pool_analyses
    WHERE user_wallet = p_user_wallet
      AND pool_id = p_pool_id
      AND generated_at > NOW() - (p_max_age_hours || ' hours')::INTERVAL
  ) INTO analysis_exists;
  
  RETURN analysis_exists;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE '✅ User-specific reports setup complete!'; 
  RAISE NOTICE '🔒 RLS enabled - users only see their own reports';
  RAISE NOTICE '📊 New indexes: user_wallet, user_wallet + generated_at';
  RAISE NOTICE '🔧 New functions: get_user_report_history(), user_has_recent_analysis()';
END $$;

