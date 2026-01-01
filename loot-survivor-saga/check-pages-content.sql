-- Check the actual content of pages JSONB column for completed sagas
-- Run this in Supabase SQL Editor

-- 1. Check pages content for the first saga with data
SELECT 
    id,
    status,
    total_pages,
    jsonb_array_length(pages) as pages_count,
    pages::jsonb -> 0 as first_page_object,
    pages::jsonb -> 0 -> 'pageImageUrl' as first_page_image_url,
    pages::jsonb -> 0 -> 'pageNumber' as first_page_number,
    pages::jsonb -> 0 -> 'panels' as first_page_panels
FROM sagas
WHERE id = '69d80183-a46a-495f-b4de-752fb49549a7';

-- 2. Check all pages for this saga
SELECT 
    id,
    status,
    jsonb_array_elements(pages) as page_data
FROM sagas
WHERE id = '69d80183-a46a-495f-b4de-752fb49549a7';

-- 3. Update status to 'completed' for sagas that have pages data but status is 'pending'
UPDATE sagas
SET status = 'completed'
WHERE pages IS NOT NULL 
  AND jsonb_array_length(pages) > 0
  AND status = 'pending';

-- 4. Verify the update
SELECT 
    id,
    status,
    total_pages,
    jsonb_array_length(pages) as pages_count
FROM sagas
WHERE id IN ('69d80183-a46a-495f-b4de-752fb49549a7', '54cc991b-9a3b-4bf3-a094-2721241a7d6b');




