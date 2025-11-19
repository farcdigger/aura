-- Supabase Referrals & Messaging Update Migration
-- Bu dosyayı Supabase Dashboard'da çalıştırın

-- ============================================
-- 1. MESSAGING UPDATES (Mesajlaşma Güncellemeleri)
-- ============================================

-- Gece 03:00'da çalışan temizlik fonksiyonunu kaldır (Mesajlar silinmesin)
DROP FUNCTION IF EXISTS cleanup_old_messages();

-- Toplam mesaj sayısını tutmak için sütun ekle
ALTER TABLE message_rate_limits 
ADD COLUMN IF NOT EXISTS total_messages_sent INTEGER DEFAULT 0;

-- Rate limit trigger'ını güncelle (Toplam sayıyı artırmak için)
CREATE OR REPLACE FUNCTION increment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  now_time TIMESTAMP := NOW();
BEGIN
  -- Rate limit kaydını güncelle veya oluştur
  INSERT INTO message_rate_limits (
    wallet_address,
    messages_sent_minute,
    messages_sent_hour,
    total_messages_sent, -- Yeni sütun
    last_minute_reset,
    last_hour_reset,
    updated_at
  )
  VALUES (
    NEW.sender_wallet,
    1,
    1,
    1, -- İlk mesaj
    now_time,
    now_time,
    now_time
  )
  ON CONFLICT (wallet_address) DO UPDATE SET
    messages_sent_minute = CASE 
      WHEN message_rate_limits.last_minute_reset < now_time - INTERVAL '1 minute' THEN 1
      ELSE message_rate_limits.messages_sent_minute + 1
    END,
    messages_sent_hour = CASE 
      WHEN message_rate_limits.last_hour_reset < now_time - INTERVAL '1 hour' THEN 1
      ELSE message_rate_limits.messages_sent_hour + 1
    END,
    total_messages_sent = message_rate_limits.total_messages_sent + 1, -- Her mesajda artır
    last_minute_reset = CASE 
      WHEN message_rate_limits.last_minute_reset < now_time - INTERVAL '1 minute' THEN now_time
      ELSE message_rate_limits.last_minute_reset
    END,
    last_hour_reset = CASE 
      WHEN message_rate_limits.last_hour_reset < now_time - INTERVAL '1 hour' THEN now_time
      ELSE message_rate_limits.last_hour_reset
    END,
    updated_at = now_time;
    
  RETURN NEW;
END;
$$;

-- ============================================
-- 2. REFERRAL SYSTEM (Referans Sistemi)
-- ============================================

-- Referans kodları tablosu
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Referans takibi tablosu
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet VARCHAR(255) NOT NULL, -- Referans olan (Link sahibi)
  referee_wallet VARCHAR(255) NOT NULL, -- Referans olunan (Yeni gelen)
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid
  reward_amount DECIMAL(10, 2) DEFAULT 0.50,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Bir kişi sadece bir kez referans olabilir
  CONSTRAINT unique_referee UNIQUE (referee_wallet)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- RLS Policies
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Herkes referans kodlarını okuyabilir (Link kontrolü için)
CREATE POLICY "Public read referral codes"
  ON referral_codes FOR SELECT
  USING (true);

-- Kullanıcılar kendi kodlarını oluşturabilir
CREATE POLICY "Users can create their own code"
  ON referral_codes FOR INSERT
  WITH CHECK (wallet_address = current_setting('app.current_wallet', true));

-- Kullanıcılar kendi referanslarını görebilir
CREATE POLICY "Users can view their referrals"
  ON referrals FOR SELECT
  USING (referrer_wallet = current_setting('app.current_wallet', true));

-- Sistem referans ekleyebilir (API üzerinden)
CREATE POLICY "System can insert referrals"
  ON referrals FOR INSERT
  WITH CHECK (true);

-- Migration Başarılı Mesajı
DO $$
BEGIN
  RAISE NOTICE '✅ Referral and Messaging update migration completed!';
END;
$$;

