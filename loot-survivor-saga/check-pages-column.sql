-- Check if pages and total_pages columns exist in sagas table
-- Run this in Supabase SQL Editor

-- 1. Check if columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'sagas'
  AND column_name IN ('pages', 'total_pages')
ORDER BY column_name;

-- 2. Check if pages column is JSONB type
SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'sagas'
  AND column_name = 'pages';

-- 3. Check if there's a GIN index on pages column
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'sagas'
  AND indexname LIKE '%pages%';

-- 4. Check a sample saga to see if pages data exists
SELECT 
    id,
    status,
    total_pages,
    CASE 
        WHEN pages IS NULL THEN 'NULL'
        WHEN pages::text = '[]' THEN 'EMPTY ARRAY'
        ELSE 'HAS DATA'
    END as pages_status,
    CASE 
        WHEN pages IS NULL THEN NULL
        ELSE jsonb_array_length(pages)
    END as pages_count,
    CASE 
        WHEN pages IS NULL THEN NULL
        WHEN jsonb_array_length(pages) > 0 THEN (pages->0->>'pageImageUrl')::text
        ELSE NULL
    END as first_page_image_url_preview
FROM sagas
ORDER BY created_at DESC
LIMIT 5;




