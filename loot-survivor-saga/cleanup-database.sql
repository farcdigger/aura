-- Supabase Database Temizleme Sorguları
-- DİKKAT: Bu sorgular tüm verileri siler!

-- 1. Önce sagas tablosunu temizle (foreign key constraint nedeniyle önce)
DELETE FROM sagas;

-- 2. Sonra games tablosunu temizle
DELETE FROM games;

-- 3. (Opsiyonel) Tüm tabloları sıfırla ve ID'leri resetle
-- TRUNCATE kullanarak auto-increment'leri de sıfırla
TRUNCATE TABLE sagas RESTART IDENTITY CASCADE;
TRUNCATE TABLE games RESTART IDENTITY CASCADE;

-- 4. Kontrol: Kaç kayıt kaldı?
SELECT 
  (SELECT COUNT(*) FROM sagas) as sagas_count,
  (SELECT COUNT(*) FROM games) as games_count;

-- 5. (Opsiyonel) Sadece belirli bir game_id'ye ait kayıtları sil
-- DELETE FROM sagas WHERE game_id = '133595';
-- DELETE FROM games WHERE id = '133595';

-- 6. (Opsiyonel) Sadece 'pending' veya 'failed' status'ündeki sagaları sil
-- DELETE FROM sagas WHERE status IN ('pending', 'failed');






