# 📅 API KEY'LER - HAFTALIK TIMELINE

> **Strateji:** Her hafta sadece o hafta gereken key'leri ekleyin. Gereksiz yere şimdiden hepsini toplamaya gerek yok!

---

## ✅ HAFTA 1: Temel Altyapı (ŞU AN)

### **Gereken Key'ler:**

1. **Supabase** (Veritabanı kurulumu için)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - **NOT:** Anon key'e gerek yok! Sadece Service Role key yeterli (server-side kullanacağız)
   - **Nereden:** Mevcut projeden kopyala (`apps/web/.env.local`) veya yeni proje oluştur
   - **Ne zaman:** Hafta 1, Gün 1-2 (Veritabanı setup)

2. **Daydreams** (Hazır olsun, Hafta 2'de kullanacağız)
   - `INFERENCE_API_KEY`
   - **Nereden:** Mevcut projeden kopyala (`apps/web/.env.local`)
   - **Ne zaman:** Şimdi ekle (kolay, zaten var)

### **Gerekmeyen Key'ler (Şimdilik):**
- ❌ Replicate (Hafta 2'de gerekecek)
- ❌ Cloudflare R2 (Hafta 3-4'te gerekecek)
- ❌ Redis/Upstash (Hafta 3'te gerekecek)

---

## 📅 HAFTA 2: AI Entegrasyonu

### **Gereken Key'ler:**

1. **Replicate** (Görsel üretimi için)
   - `REPLICATE_API_TOKEN`
   - **Nereden:** https://replicate.com/account/api-tokens
   - **Ne zaman:** Hafta 2, Gün 11-14 (Image generation başlamadan)

### **Zaten var:**
- ✅ Daydreams (Hafta 1'de ekledik)

---

## 📅 HAFTA 3: Queue ve Frontend

### **Gereken Key'ler:**

1. **Redis/Upstash** (Queue sistemi için)
   - `UPSTASH_REDIS_URL`
   - `UPSTASH_REDIS_TOKEN`
   - **Nereden:** Mevcut projeden Vercel KV kullan veya yeni Upstash oluştur
   - **Ne zaman:** Hafta 3, Gün 15-17 (Queue setup)

### **Zaten var:**
- ✅ Supabase
- ✅ Daydreams
- ✅ Replicate

---

## 📅 HAFTA 4: Deployment ve Polish

### **Gereken Key'ler:**

1. **Cloudflare R2** (Storage için - Opsiyonel, local dev için gerekmez)
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - **Nereden:** https://dash.cloudflare.com/
   - **Ne zaman:** Production deployment'tan önce (Hafta 4, Gün 29-30)

### **Zaten var:**
- ✅ Tüm diğer key'ler

---

## 🎯 ŞU AN YAPMAN GEREKENLER

### **1. Supabase Key'leri**

**Seçenek A: Mevcut projeyi kullan**
```bash
# apps/web/.env.local dosyasından kopyala:
NEXT_PUBLIC_SUPABASE_URL=https://vzhclqjrqhhpyicaktpv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Seçenek B: Yeni proje oluştur (Önerilen - İzolasyon için)**
1. https://supabase.com → New Project
2. Name: `loot-survivor-saga`
3. Settings → API → Key'leri kopyala

### **2. Daydreams Key**

```bash
# apps/web/.env.local dosyasından kopyala:
INFERENCE_API_KEY=your_actual_key_here
```

---

## 📝 .env.local Dosyası Şu An İçin

Sadece şunları doldur:

```bash
# Supabase (Hafta 1 için ZORUNLU)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Daydreams (Hafta 2 için hazır olsun)
INFERENCE_API_KEY=your_key_here

# Diğerleri şimdilik boş bırakabilirsin:
# REPLICATE_API_TOKEN=
# UPSTASH_REDIS_URL=
# R2_ACCOUNT_ID=
```

---

## ✅ Checklist

- [ ] Supabase key'leri eklendi (Hafta 1 için)
- [ ] Daydreams key eklendi (Hafta 2 için hazır)
- [ ] Diğer key'ler boş bırakıldı (Sonra dolduracağız)

**Hazır olduğunda:**
> "Supabase ve Daydreams key'leri hazır, Hafta 1'e başlayalım!"

