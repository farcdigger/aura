-- Supabase Migration SQL for Follows System
-- Run this in Supabase SQL Editor

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id SERIAL PRIMARY KEY,
  follower_wallet VARCHAR(255) NOT NULL,
  following_wallet VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_wallet, following_wallet),
  CHECK (follower_wallet != following_wallet)
);

-- Create indexes for follows table
CREATE INDEX IF NOT EXISTS idx_follows_follower_wallet ON follows(follower_wallet);
CREATE INDEX IF NOT EXISTS idx_follows_following_wallet ON follows(following_wallet);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON follows(created_at DESC);

