-- SQL query to check saga status in Supabase
-- Run this in Supabase SQL Editor

SELECT 
  id,
  game_id,
  status,
  progress_percent,
  current_step,
  created_at,
  completed_at,
  total_pages,
  total_panels,
  CASE 
    WHEN pages IS NULL THEN 'NULL'
    WHEN pages = '[]'::jsonb THEN 'EMPTY ARRAY'
    ELSE 'HAS DATA'
  END as pages_status,
  CASE
    WHEN pages IS NULL THEN 0
    WHEN jsonb_typeof(pages) = 'array' THEN jsonb_array_length(pages)
    ELSE 0
  END as pages_count,
  CASE
    WHEN panels IS NULL THEN 'NULL'
    WHEN panels = '[]'::jsonb THEN 'EMPTY ARRAY'
    ELSE 'HAS DATA'
  END as panels_status,
  CASE
    WHEN panels IS NULL THEN 0
    WHEN jsonb_typeof(panels) = 'array' THEN jsonb_array_length(panels)
    ELSE 0
  END as panels_count
FROM sagas
WHERE id = '7135eb93-0448-413c-8176-4de109e8dde0';

