-- Fix saga status: Update status to 'completed' if saga has pages and progress is 100%
-- Run this in Supabase SQL Editor

UPDATE sagas
SET status = 'completed'
WHERE id = '7135eb93-0448-413c-8176-4de109e8dde0'
  AND status = 'pending'
  AND progress_percent = 100
  AND pages IS NOT NULL
  AND jsonb_array_length(pages) > 0;

-- Verify the update
SELECT 
  id,
  status,
  progress_percent,
  current_step,
  total_pages,
  jsonb_array_length(pages) as pages_count
FROM sagas
WHERE id = '7135eb93-0448-413c-8176-4de109e8dde0';

