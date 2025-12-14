-- Add total_score column to frog_jump_leaderboard table
-- This tracks accumulated score across all games (for ticket rewards)
-- Run this in Supabase SQL Editor

ALTER TABLE frog_jump_leaderboard 
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0;

-- Update existing rows to set total_score = score initially
UPDATE frog_jump_leaderboard 
SET total_score = score 
WHERE total_score = 0 OR total_score IS NULL;

