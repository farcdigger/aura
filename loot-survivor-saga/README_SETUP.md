# 🚀 Hafta 1 - İlk Adımlar

## ✅ Tamamlananlar

- [x] Next.js projesi kuruldu
- [x] Package.json ve config dosyaları oluşturuldu
- [x] Supabase client hazır
- [x] Bibliotheca GraphQL client hazır
- [x] İlk API endpoint oluşturuldu (`/api/games/[gameId]`)

## 📋 Şimdi Yapman Gerekenler

### 1. Supabase Veritabanı Schema'sını Oluştur

1. Supabase Dashboard'a git: https://supabase.com/dashboard
2. Projeni seç
3. SQL Editor'ü aç
4. `supabase-schema.sql` dosyasının içeriğini kopyala
5. SQL Editor'e yapıştır ve "Run" butonuna bas

**Kontrol:**
- 4 tablo oluştu mu? (users, games, sagas, generation_logs)
- Index'ler oluştu mu?

### 2. Test Et

```bash
# Development server'ı başlat
npm run dev

# Başka bir terminal'de test et
curl http://localhost:3000/api/games/0x123...
```

## 🎯 Sonraki Adımlar (Hafta 1 Devam)

- Gün 3-4: Bibliotheca GraphQL test scriptleri
- Gün 5-7: Diğer API endpoint'leri








