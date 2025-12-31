# 🎨 Loot Survivor Saga Generator

> Loot Survivor oyununuzu destansı bir comic book'a dönüştürün!

## 📋 Hızlı Başlangıç

### 1. Environment Variables Hazırlama

```bash
# env.local.example dosyasını kopyala
cp env.local.example .env.local

# .env.local dosyasını aç ve API key'leri doldur
```

### 2. Gerekli API Key'ler

#### 🔴 YENİ GEREKENLER (Zorunlu):

1. **Daydreams API Key** (MEVCUT PROJEDEN!)
   - `apps/web/env.local.example` dosyasından `INFERENCE_API_KEY` kopyala
   - `.env.local` içine: `INFERENCE_API_KEY=...`
   - **NOT:** OpenAI API key'e GEREK YOK! Daydreams üzerinden GPT-4o kullanılacak

2. **Replicate API Token**
   - https://replicate.com/account/api-tokens
   - Sign up (GitHub ile kolay)
   - Account → API Tokens → Create token
   - `.env.local` içine: `REPLICATE_API_TOKEN=r8_...`

3. **Cloudflare R2**
   - https://dash.cloudflare.com/
   - R2 → Create bucket → Name: `loot-survivor-sagas`
   - Manage R2 API Tokens → Create API Token
   - `.env.local` içine: `R2_ACCOUNT_ID=...`, `R2_ACCESS_KEY_ID=...`, `R2_SECRET_ACCESS_KEY=...`

#### ✅ MEVCUT PROJEDEN KULLANILABILIR:

- **Supabase**: `apps/web/env.local.example` dosyasından kopyala
- **Redis**: Mevcut Vercel KV veya yeni Upstash oluştur

### 3. Detaylı Yol Haritası

Tam geliştirme planı için: `../LOOT_SURVIVOR_SAGA_ROADMAP.md`

## 🚀 Geliştirme

```bash
# Bağımlılıkları yükle
pnpm install

# Development server başlat
pnpm dev

# Build
pnpm build
```

## 📁 Proje Yapısı

```
loot-survivor-saga/
├── env.local.example      # Environment variables template
├── .env.local             # Gerçek API key'ler (Git'e commit etme!)
├── README.md              # Bu dosya
└── [Geliştirme başladığında diğer dosyalar eklenecek]
```

## 📚 Kaynaklar

- [Yol Haritası](../LOOT_SURVIVOR_SAGA_ROADMAP.md)
- [Kullanıcı Görevleri](../KULLANICI_GOREVLERI.md)

