# ✅ API KEY'LER CHECKLIST

> Bu dosyayı doldurarak hangi key'lerin hazır olduğunu takip edin.

## 🔴 YENİ GEREKENLER (Zorunlu)

- [ ] **Daydreams API Key** (MEVCUT PROJEDEN!)
  - [ ] `apps/web/env.local.example` dosyasından `INFERENCE_API_KEY` kopyala
  - [ ] `.env.local` dosyasına eklendi
  - [ ] **NOT:** OpenAI API key'e GEREK YOK! Daydreams üzerinden GPT-4o kullanılacak

- [ ] **Replicate API Token**
  - [ ] Hesap oluşturuldu (GitHub ile)
  - [ ] API token oluşturuldu
  - [ ] `.env.local` dosyasına eklendi
  - Token: `r8_...`

- [ ] **Cloudflare R2**
  - [ ] Hesap oluşturuldu
  - [ ] Bucket oluşturuldu: `loot-survivor-sagas`
  - [ ] API Token oluşturuldu
  - [ ] `.env.local` dosyasına eklendi:
    - [ ] `R2_ACCOUNT_ID`
    - [ ] `R2_ACCESS_KEY_ID`
    - [ ] `R2_SECRET_ACCESS_KEY`
    - [ ] `R2_BUCKET_NAME`

## ✅ MEVCUT PROJEDEN KULLANILABILIR

- [ ] **Supabase**
  - [ ] Seçenek: Mevcut projeyi kullan veya yeni proje oluştur
  - [ ] `.env.local` dosyasına eklendi:
    - [ ] `NEXT_PUBLIC_SUPABASE_URL`
    - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - [ ] `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Redis/Queue**
  - [ ] Seçenek: Mevcut Vercel KV kullan veya yeni Upstash oluştur
  - [ ] `.env.local` dosyasına eklendi:
    - [ ] `UPSTASH_REDIS_URL` (veya `KV_REST_API_URL`)
    - [ ] `UPSTASH_REDIS_TOKEN` (veya `KV_REST_API_TOKEN`)

## ⚪ OPSIYONEL (Gelecek için)

- [ ] **Daydreams Image Models** (v2 - Video için)
  - Aynı `INFERENCE_API_KEY` kullanılacak
  - Daydreams'te görsel modelleri de mevcut

## 📝 Notlar

- Tüm key'ler `.env.local` dosyasında mı? ✅
- `.env.local` dosyası `.gitignore`'da mı? ✅
- Test için yeterli credit var mı? ✅

---

**Hazır olduğunuzda:**
> "API key'ler hazır, devam edebiliriz!"

