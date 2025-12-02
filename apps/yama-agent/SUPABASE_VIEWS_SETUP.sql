-- ============================================
-- GMX DERIVATIVES VIEWS SETUP
-- ============================================
-- IMPORTANT: Run the main table schema FIRST (supabase-schema-derivatives.sql)
-- Then run each view creation below SEPARATELY in Supabase SQL Editor
-- If any view fails, you can skip it - views are optional helpers

-- ============================================
-- VIEW 1: Recent Liquidations
-- ============================================
-- Shows liquidation events from the last 7 days
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

-- Test this view:
-- SELECT * FROM recent_liquidations LIMIT 5;

-- ============================================
-- VIEW 2: Top Traders
-- ============================================
CREATE OR REPLACE VIEW top_traders AS
SELECT 
  account_id,
  COUNT(DISTINCT CASE WHEN entity_type = 'positionSnapshot' THEN id END) as position_updates,
  COUNT(DISTINCT CASE WHEN entity_type = 'swap' THEN id END) as swap_count,
  COUNT(DISTINCT CASE WHEN entity_type = 'liquidation' THEN id END) as liquidation_count,
  COALESCE(SUM(CASE WHEN entity_type = 'swap' THEN amount_in_usd ELSE 0 END), 0) as total_swap_volume_usd
FROM graph_derivatives_data
WHERE fetched_at >= NOW() - INTERVAL '7 days'
  AND account_id IS NOT NULL
GROUP BY account_id
ORDER BY total_swap_volume_usd DESC
LIMIT 100;

-- Test query:
-- SELECT * FROM top_traders LIMIT 10;

-- ============================================
-- VIEW 3: Current Open Interest (Simplified)
-- ============================================
CREATE OR REPLACE VIEW current_open_interest AS
SELECT 
  asset_symbol,
  position_side,
  COUNT(DISTINCT account_id) as position_count,
  SUM(balance_usd) as total_usd,
  AVG(balance_usd) as avg_position_usd,
  MAX(balance_usd) as max_position_usd
FROM graph_derivatives_data
WHERE entity_type = 'positionSnapshot'
  AND balance_usd > 0
  AND fetched_at >= NOW() - INTERVAL '1 day'
GROUP BY asset_symbol, position_side
ORDER BY total_usd DESC;

-- Test query:
-- SELECT * FROM current_open_interest;

-- ============================================
-- VIEW 4: Long vs Short Ratio (Fixed)
-- ============================================
CREATE OR REPLACE VIEW long_short_ratio AS
WITH latest_snapshots AS (
  SELECT 
    asset_symbol,
    position_side,
    balance_usd
  FROM graph_derivatives_data
  WHERE entity_type = 'positionSnapshot'
    AND balance_usd > 0
    AND fetched_at >= NOW() - INTERVAL '1 day'
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
FROM latest_snapshots
GROUP BY asset_symbol
HAVING SUM(balance_usd) > 0
ORDER BY (SUM(CASE WHEN position_side = 'LONG' THEN balance_usd ELSE 0 END) + 
          SUM(CASE WHEN position_side = 'SHORT' THEN balance_usd ELSE 0 END)) DESC;

-- Test query:
-- SELECT * FROM long_short_ratio;

-- ============================================
-- VIEW 5: Hourly Trading Activity
-- ============================================
CREATE OR REPLACE VIEW hourly_trading_activity AS
SELECT 
  DATE_TRUNC('hour', TO_TIMESTAMP(timestamp)) as hour,
  COUNT(DISTINCT CASE WHEN entity_type = 'swap' THEN id END) as swaps,
  COUNT(DISTINCT CASE WHEN entity_type = 'positionSnapshot' THEN id END) as position_changes,
  COUNT(DISTINCT CASE WHEN entity_type = 'liquidation' THEN id END) as liquidations,
  SUM(CASE WHEN entity_type = 'swap' THEN amount_in_usd ELSE 0 END) as swap_volume_usd,
  SUM(CASE WHEN entity_type = 'liquidation' THEN amount_usd ELSE 0 END) as liquidation_volume_usd
FROM graph_derivatives_data
WHERE fetched_at >= NOW() - INTERVAL '7 days'
  AND timestamp IS NOT NULL
GROUP BY hour
ORDER BY hour DESC;

-- Test query:
-- SELECT * FROM hourly_trading_activity LIMIT 24;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check if all views exist
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%derivatives%' OR table_name LIKE '%liquidation%' OR table_name LIKE '%trader%')
ORDER BY table_name;

-- Quick data check
SELECT 
  entity_type,
  COUNT(*) as count
FROM graph_derivatives_data
GROUP BY entity_type
ORDER BY count DESC;

