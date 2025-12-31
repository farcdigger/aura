-- Add pages column to sagas table
-- Run this in Supabase SQL Editor

ALTER TABLE sagas 
ADD COLUMN IF NOT EXISTS pages JSONB, -- Comic pages array (new format: [{pageNumber, panels, pageImageUrl, pageDescription}])
ADD COLUMN IF NOT EXISTS total_pages INTEGER; -- Total number of comic pages

CREATE INDEX IF NOT EXISTS idx_sagas_pages ON sagas USING GIN (pages); -- GIN index for JSONB queries


