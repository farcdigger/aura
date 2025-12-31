-- ============================================
-- LOOT SURVIVOR SAGA - SUPABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- ============================================
-- USERS TABLOSU
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  total_sagas_generated INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 1 -- Free tier: 1 ücretsiz saga
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- ============================================
-- GAMES TABLOSU (Cache için)
-- ============================================
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY, -- Game ID (Starknet'ten)
  user_wallet TEXT NOT NULL,
  adventurer_name TEXT,
  level INTEGER,
  total_turns INTEGER,
  final_score INTEGER,
  is_dead BOOLEAN DEFAULT TRUE,
  death_reason TEXT,
  raw_data JSONB, -- Tüm oyun verisi
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_wallet);
CREATE INDEX IF NOT EXISTS idx_games_fetched ON games(fetched_at);

-- ============================================
-- SAGAS TABLOSU
-- ============================================
-- Create ENUM type (IF NOT EXISTS not supported for TYPE, so we use DO block)
DO $$ BEGIN
  CREATE TYPE saga_status AS ENUM ('pending', 'generating_story', 'generating_images', 'rendering', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sagas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  status saga_status DEFAULT 'pending',
  
  -- Hikaye verisi
  story_text TEXT,
  panels JSONB, -- [{panel_number, narration, image_prompt, image_url}]
  
  -- Metadata
  total_panels INTEGER,
  generation_time_seconds INTEGER,
  cost_usd NUMERIC(10, 4),
  
  -- URLs
  final_url TEXT, -- Cloudflare R2 URL
  share_url TEXT, -- Public paylaşım linki
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sagas_user ON sagas(user_wallet);
CREATE INDEX IF NOT EXISTS idx_sagas_game ON sagas(game_id);
CREATE INDEX IF NOT EXISTS idx_sagas_status ON sagas(status);

-- ============================================
-- GENERATION_LOGS (Debugging için)
-- ============================================
CREATE TABLE IF NOT EXISTS generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_id UUID NOT NULL,
  step TEXT NOT NULL, -- 'fetch_data', 'generate_story', 'generate_panel_1', etc.
  status TEXT NOT NULL, -- 'started', 'completed', 'failed'
  details JSONB,
  error_message TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (saga_id) REFERENCES sagas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_saga ON generation_logs(saga_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Users tablosu için RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own data" ON users;
CREATE POLICY "Users can view their own data"
ON users FOR SELECT
USING (wallet_address = current_setting('app.current_user_wallet', TRUE));

DROP POLICY IF EXISTS "Users can update their own data" ON users;
CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
USING (wallet_address = current_setting('app.current_user_wallet', TRUE));

-- Sagas tablosu için RLS
ALTER TABLE sagas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sagas" ON sagas;
CREATE POLICY "Users can view their own sagas"
ON sagas FOR SELECT
USING (user_wallet = current_setting('app.current_user_wallet', TRUE));

DROP POLICY IF EXISTS "Users can create their own sagas" ON sagas;
CREATE POLICY "Users can create their own sagas"
ON sagas FOR INSERT
WITH CHECK (user_wallet = current_setting('app.current_user_wallet', TRUE));

