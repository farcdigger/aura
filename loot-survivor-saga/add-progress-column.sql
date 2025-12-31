-- Add progress tracking and comic pages columns to sagas table
-- Run this in Supabase SQL Editor

ALTER TABLE sagas 
ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
ADD COLUMN IF NOT EXISTS current_step TEXT DEFAULT 'initializing',
ADD COLUMN IF NOT EXISTS pages JSONB, -- Comic pages array (new format)
ADD COLUMN IF NOT EXISTS total_pages INTEGER; -- Total number of comic pages

CREATE INDEX IF NOT EXISTS idx_sagas_progress ON sagas(progress_percent);
CREATE INDEX IF NOT EXISTS idx_sagas_pages ON sagas USING GIN (pages); -- GIN index for JSONB queries

