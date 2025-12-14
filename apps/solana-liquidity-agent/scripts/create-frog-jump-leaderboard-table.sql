-- Create frog_jump_leaderboard table for storing game scores
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS frog_jump_leaderboard (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster leaderboard queries
CREATE INDEX IF NOT EXISTS idx_frog_jump_leaderboard_score ON frog_jump_leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_frog_jump_leaderboard_wallet ON frog_jump_leaderboard(wallet_address);
CREATE INDEX IF NOT EXISTS idx_frog_jump_leaderboard_created_at ON frog_jump_leaderboard(created_at DESC);

-- Create unique constraint to keep only the best score per wallet
-- If a user plays again and gets a better score, update the existing record
-- We'll handle this in the application logic

