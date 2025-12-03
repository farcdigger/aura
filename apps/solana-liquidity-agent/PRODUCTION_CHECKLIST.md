# 🚀 PRODUCTION DEPLOYMENT CHECKLIST

Bu dosya, projeyi production'a çıkarmadan önce yapılması gereken tüm değişiklikleri içerir.

**SON GÜNCELLEME:** Adım 9 tamamlandı (Redis & Queue sistemi)

---

## 🔧 LOCAL DEVELOPMENT SETUP (Adım 10-12 için GEREKLI)

### **Redis - Docker ile Başlatma**
**Öncelik:** 🔴 KRİTİK  
**Timing:** ŞİMDİ (Adım 10'dan önce)

**Adımlar:**

1. **Docker Desktop'ın çalıştığından emin olun**
   ```bash
   docker --version
   # Docker version 24.0.0 veya üzeri görmeli
   ```

2. **Redis Container Başlatın**
   ```bash
   docker run -d --name redis-local -p 6379:6379 redis:7-alpine
   ```
   
   **Açıklama:**
   - `-d` : Detached mode (arka planda çalışır)
   - `--name redis-local` : Container ismi
   - `-p 6379:6379` : Port mapping (host:container)
   - `redis:7-alpine` : Hafif Redis image

3. **Kontrol Edin**
   ```bash
   docker ps
   ```
   
   **Beklenen Çıktı:**
   ```
   CONTAINER ID   IMAGE           STATUS         PORTS                    NAMES
   abc123def456   redis:7-alpine  Up 2 minutes   0.0.0.0:6379->6379/tcp   redis-local
   ```

4. **Redis Bağlantısını Test Edin**
   ```bash
   docker exec -it redis-local redis-cli ping
   ```
   
   **Beklenen:** `PONG` (bağlantı başarılı)

5. **.env Dosyasını Kontrol Edin**
   ```bash
   REDIS_URL=redis://localhost:6379
   ```
   ✅ Bu satır zaten doğru, değiştirmeyin!

**Sorun Giderme:**

- **Port zaten kullanılıyor hatası:**
  ```bash
  docker stop redis-local
  docker rm redis-local
  # Sonra tekrar run komutu
  ```

- **Docker Desktop çalışmıyor:**
  - Docker Desktop'ı başlatın
  - Windows: Start Menu → Docker Desktop

**NOT:** Bu Redis sadece local test içindir. Production'da Upstash kullanacaksınız!

---

## 📍 Local vs Production Farkları

| Özellik | Local (Adım 10-12) | Production (Adım 12+) |
|---------|-------------------|----------------------|
| **Redis** | Docker (localhost:6379) | Upstash (cloud) |
| **API Server** | Bun local (port 3002) | Vercel (serverless) |
| **Worker** | Bun local (terminal) | Railway (always-on) |
| **.env** | `.env` (local değerler) | Vercel/Railway env vars |
| **URL** | http://localhost:3002 | https://your-app.vercel.app |

---

## ⚠️ PLACEHOLDER/MOCK KODLAR (ÖNCELİKLE DÜZELTİLMELİ)

### 1. **Helius Client - Pool Reserves Parser** 
**Dosya:** `src/lib/helius-client.ts`  
**Satırlar:** ~165-190  
**Durum:** ❌ Mock data döndürüyor

**Şu Anki Kod:**
```typescript
const reserves: PoolReserves = {
  tokenAMint: 'placeholder_mint_a',  // ❌ PLACEHOLDER
  tokenBMint: 'placeholder_mint_b',  // ❌ PLACEHOLDER
  tokenAReserve: BigInt(0),          // ❌ Gerçek değil
  tokenBReserve: BigInt(0),          // ❌ Gerçek değil
  poolAuthority: poolAddress,
  lpMint: 'placeholder_lp_mint',     // ❌ PLACEHOLDER
};
```

**Yapılacak:**
- [ ] Raydium SDK entegrasyonu (`@raydium-io/raydium-sdk`)
- [ ] Borsh deserializer ile pool account parsing
- [ ] Gerçek token mint'lerini çek
- [ ] Gerçek reserve miktarlarını hesapla

**Referans:** https://github.com/raydium-io/raydium-sdk

---

### 2. **Helius Client - Transaction Parsing (Buy/Sell Detection)**
**Dosya:** `src/lib/helius-client.ts`  
**Satırlar:** ~220-235  
**Durum:** ❌ Basit heuristic kullanıyor

**Şu Anki Kod:**
```typescript
// ❌ PLACEHOLDER: Assume 60% buys, 40% sells
const buyCount = Math.floor(totalCount * 0.6);
const sellCount = totalCount - buyCount;
```

**Yapılacak:**
- [ ] Her transaction'ı `getParsedTransaction()` ile parse et
- [ ] Token balance değişimlerini analiz et
- [ ] Swap direction'ı tespit et (tokenA → tokenB = buy, tokenB → tokenA = sell)
- [ ] Gerçek volume hesaplamaları

**Kod Örneği (eklenecek):**
```typescript
for (const sig of signatures) {
  const tx = await this.getParsedTransaction(sig.signature);
  const preBalances = tx?.meta?.preTokenBalances || [];
  const postBalances = tx?.meta?.postTokenBalances || [];
  
  // Token balance comparison logic
  // ...
}
```

---

### 3. **Transaction Limit - Şu an 1000, Artırılabilir**
**Dosya:** `src/lib/helius-client.ts`  
**Satır:** 14  
**Durum:** ✅ Çalışıyor ama sınırlı

**Şu Anki Kod:**
```typescript
const DEFAULT_TX_LIMIT = 1000; // Hard-coded
const MAX_TX_LIMIT = 1000;     // Helius single request limit
```

**Yapılacak (Opsiyonel):**
- [ ] Environment variable'dan okuma (`TRANSACTION_ANALYSIS_LIMIT`)
- [ ] Pagination ile 5000+ transaction desteği
- [ ] Kullanıcıya limit seçtirme (API parametresi)

---

### 4. **USD Price Data - Şu an mevcut değil**
**Dosya:** `src/lib/helius-client.ts`  
**Satır:** 241  
**Durum:** ❌ Her zaman 0 döndürüyor

**Şu Anki Kod:**
```typescript
avgVolumeUSD: 0, // TODO: Calculate from actual transaction data
```

**Yapılacak:**
- [ ] Jupiter Price API entegrasyonu
- [ ] Token fiyatlarını fetch et
- [ ] Volume * Price hesaplaması
- [ ] TVL USD olarak göster

**Yeni Dosya:** `src/lib/jupiter-client.ts` (oluşturulacak)

---

## 🔧 CONFIGURATION DEĞİŞİKLİKLERİ

### 5. **Environment Variables - Production'a Geçiş**
**Dosya:** `.env`  
**Durum:** ✅ TAMAMLANDI! Upstash Redis kullanıyoruz.

**Mevcut Durum:**

```bash
# ✅ Production-Ready (Upstash)
REDIS_URL=rediss://default:AavK...@helped-dragon-43978.upstash.io:6379
```

**Yapılacak:**
- [x] Upstash Redis hesabı oluştur (https://upstash.com) ✅
- [x] Redis database oluştur (Region: US-East) ✅
- [x] Connection URL'i `.env` dosyasına ekle ✅
- [ ] Vercel environment variables'a ekle (Production deploy sırasında)
- [ ] Railway environment variables'a ekle (Production deploy sırasında)

---

### 6. **Transaction Limit Config**
**Dosya:** `.env`  
**Durum:** ❌ Henüz yok

**Eklenecek:**
```bash
# Transaction analysis settings
TRANSACTION_ANALYSIS_LIMIT=1000  # Artırılabilir: 5000, 10000
```

---

### 7. **Worker Concurrency - Production Optimization**
**Dosya:** `.env`  
**Satır:** WORKER_CONCURRENCY=5  
**Durum:** ✅ Çalışıyor ama optimize edilebilir

**Production'da:**
```bash
# Development
WORKER_CONCURRENCY=5

# Production (Helius Professional plan ile)
WORKER_CONCURRENCY=20-30
```

**Yapılacak:**
- [ ] Helius plan'ınıza göre ayarlayın
- [ ] Load testing yapın
- [ ] Optimal değeri bulun

---

## 🚀 DEPLOYMENT ADIMLARI

### 8. **Upstash Redis Setup**
**Öncelik:** 🔴 KRİTİK  
**Timing:** Production öncesi

**Adımlar:**
1. [ ] https://upstash.com → Sign up
2. [ ] Create Database → Redis
3. [ ] Region: us-east-1 (Vercel'e yakın)
4. [ ] Type: Regional (free tier)
5. [ ] Copy connection string
6. [ ] `.env` dosyasına ekle
7. [ ] Test connection (healthCheck)

---

### 9. **Vercel Deployment (API Server)**
**Öncelik:** 🟡 PRODUCTION  
**Timing:** Adım 12 sonrası

**Adımlar:**
```bash
cd apps/solana-liquidity-agent
vercel --prod
```

**Environment Variables (Vercel Dashboard'da ekle):**
- [ ] `HELIUS_API_KEY`
- [ ] `INFERENCE_API_KEY`
- [ ] `DAYDREAMS_BASE_URL`
- [ ] `REPORT_MODEL`
- [ ] `REDIS_URL` (Upstash)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `WORKER_CONCURRENCY`

**Dosya:** `vercel.json` oluştur:
```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "api",
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

---

### 10. **Railway Deployment (Worker)**
**Öncelik:** 🔴 KRİTİK  
**Timing:** Adım 12 sonrası

**Adımlar:**
1. [ ] Railway Dashboard → New Project
2. [ ] Deploy from GitHub → Select repo
3. [ ] Root Directory: `apps/solana-liquidity-agent`
4. [ ] Start Command: `bun run src/worker.ts`
5. [ ] Add environment variables (same as Vercel)

**Service Configuration:**
- [ ] Memory: 512MB (başlangıç)
- [ ] Auto-restart: Enabled
- [ ] Health check: `/health` endpoint

---

### 11. **Supabase Schema - Production'da Çalıştır**
**Öncelik:** 🟡 ORTA  
**Timing:** İlk deployment öncesi

**Adımlar:**
1. [ ] Supabase Dashboard → SQL Editor
2. [ ] `scripts/setup-supabase-schema.sql` dosyasını aç
3. [ ] Tüm SQL'i kopyala → Paste → Run
4. [ ] Başarılı mesajını kontrol et
5. [ ] Table Editor'de `pool_analyses` tablosunu kontrol et

---

## 📊 TESTING & MONITORING

### 12. **Load Testing**
**Öncelik:** 🟡 ORTA  
**Timing:** Production öncesi

**Test Senaryoları:**
- [ ] 1 concurrent request
- [ ] 10 concurrent requests
- [ ] 50 concurrent requests (target)
- [ ] 100 concurrent requests (stress test)

**Tools:**
- Apache Bench (`ab`)
- k6.io
- Artillery

---

### 13. **Monitoring Setup**
**Öncelik:** 🟢 DÜŞÜK  
**Timing:** Production sonrası

**Yapılacak:**
- [ ] Sentry error tracking
- [ ] Vercel Analytics
- [ ] Railway metrics
- [ ] Upstash monitoring
- [ ] Supabase logs

---

## 🔒 SECURITY CHECKS

### 14. **API Security**
**Öncelik:** 🔴 KRİTİK  
**Timing:** Production öncesi

**Yapılacak:**
- [ ] Rate limiting (IP-based)
- [ ] CORS configuration
- [ ] API key rotation policy
- [ ] Input validation (Zod schemas)
- [ ] SQL injection prevention (Supabase RLS)

---

### 15. **Environment Secrets**
**Öncelik:** 🔴 KRİTİK  
**Timing:** ŞİMDİ

**Kontrol Et:**
- [ ] `.env` dosyası `.gitignore`'da
- [ ] Hiçbir secret GitHub'a push edilmedi
- [ ] Production secrets ayrı yönetiliyor
- [ ] Service keys güvenli

---

## 💰 COST OPTIMIZATION

### 16. **Cache Strategy**
**Öncelik:** 🟡 ORTA  
**Timing:** Production'da optimize et

**Yapılacak:**
- [ ] Cache TTL ayarları test et (5 dakika → 10 dakika?)
- [ ] Popular pools için daha uzun cache
- [ ] Cache hit rate monitor et
- [ ] LRU eviction policy

---

### 17. **API Usage Monitoring**
**Öncelik:** 🟡 ORTA  
**Timing:** Production'da takip et

**Takip Edilecek:**
- [ ] Helius API usage (quota)
- [ ] Daydreams token usage
- [ ] Supabase storage
- [ ] Redis memory usage
- [ ] Worker CPU usage

---

## 🎨 FRONTEND INTEGRATION (Gelecek)

### 18. **Web UI Development**
**Öncelik:** 🟢 DÜŞÜK  
**Timing:** MVP sonrası

**Yapılacak:**
- [ ] `apps/web/app/pool-analyzer/page.tsx` oluştur
- [ ] API client wrapper
- [ ] Real-time progress tracking
- [ ] Risk score visualization
- [ ] Chart.js integration

---

## 📝 DOCUMENTATION

### 19. **API Documentation**
**Öncelik:** 🟢 DÜŞÜK  
**Timing:** MVP sonrası

**Yapılacak:**
- [ ] OpenAPI/Swagger spec
- [ ] Postman collection
- [ ] Example requests
- [ ] Error codes documentation

---

## ✅ QUICK REFERENCE - Production Öncesi Checklist

**Kritik (Mutlaka Yapılmalı):**
- [ ] Upstash Redis kurulumu
- [ ] Supabase schema çalıştırılması
- [ ] Environment variables (production)
- [ ] Vercel deployment
- [ ] Railway deployment (worker)
- [ ] Security checks

**Önemli (İyileştirir):**
- [ ] Raydium SDK entegrasyonu
- [ ] Transaction parsing (buy/sell)
- [ ] Jupiter price API
- [ ] Monitoring setup

**Opsiyonel (İleride):**
- [ ] Transaction limit artırma
- [ ] Load testing
- [ ] Frontend development
- [ ] API documentation

---

## 📞 YARDIM ve KAYNAKLAR

**Raydium SDK:**
- GitHub: https://github.com/raydium-io/raydium-sdk
- Docs: https://docs.raydium.io/

**Helius:**
- Dashboard: https://dev.helius.dev/
- Docs: https://docs.helius.dev/

**Upstash:**
- Dashboard: https://console.upstash.com/
- Docs: https://docs.upstash.com/redis

**Deployment:**
- Vercel: https://vercel.com/docs
- Railway: https://docs.railway.app/

---

**NOT:** Bu dosyayı her adımda güncelleyin. Yeni placeholder eklenirse buraya ekleyin!

**SON GÜNCELLEME:** Adım 9 tamamlandı - Worker implementasyonu sırada (Adım 10)

