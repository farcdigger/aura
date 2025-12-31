# Vercel Environment Variables - xfroranft.xyz

## 📋 Genel Bilgiler
- **Domain**: `xfroranft.xyz`
- **Ana Web Sitesi**: `apps/web`
- **Saga Uygulaması**: `loot-survivor-saga` (ana web sitesine entegre)

---

## 🔧 Ana Web Sitesi (`apps/web`) - Vercel Environment Variables

### Blockchain Configuration
```
NEXT_PUBLIC_CHAIN_ID=8453
RPC_URL=https://mainnet.base.org
CONTRACT_ADDRESS=0x7De68EB999A314A0f986D417adcbcE515E476396
NEXT_PUBLIC_CONTRACT_ADDRESS=0x7De68EB999A314A0f986D417adcbcE515E476396
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
SERVER_SIGNER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
```

### X (Twitter) OAuth
```
X_CLIENT_ID=your_x_client_id_here
X_CLIENT_SECRET=your_x_client_secret_here
X_CALLBACK_URL=https://xfroranft.xyz/api/auth/x/callback
```

### IPFS Configuration (Choose ONE)
```
# Option 1: Pinata
PINATA_JWT=your_pinata_jwt_here

# Option 2: Web3.Storage
WEB3_STORAGE_TOKEN=your_web3_storage_token_here
```

### AI Services
```
INFERENCE_API_KEY=your_daydreams_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### Database - Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://vzhclqjrqhhpyicaktpv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
ADMIN_API_KEY=your_admin_api_key_here
UPDATE_TOKEN_SECRET=your_update_token_secret_here
```

### Cache/Rate Limiting - Vercel KV
```
KV_REST_API_URL=https://your-kv-instance.vercel.app
KV_REST_API_TOKEN=your_kv_token_here
```

### x402 Payment Protocol
```
CDP_API_KEY_ID=your-cdp-api-key-id
CDP_API_KEY_SECRET=your-cdp-api-key-secret
X402_PRICE_USDC=5000000
NEXT_PUBLIC_USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Collection Settings
```
COLLECTION_THEME=frog
MODEL_VERSION=v1.0.0
```

### YAMA Agent (Optional)
```
YAMA_AGENT_TRIGGER_URL=https://your-yama-agent-host/entrypoints/fetch-and-analyze-raw/invoke
YAMA_AGENT_TRIGGER_TOKEN=your_token_here
AGENT_NAME=yama-agent
AGENT_DESCRIPTION=Crypto market meta-analysis agent
AGENT_VERSION=0.1.0
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_NETWORK=base
PAYMENTS_RECEIVABLE_ADDRESS=0xDA9097c5672928a16C42889cD4b07d9a766827ee
PYTHON_ANALYTICS_URL=http://localhost:8000
YAMA_AGENT_PORT=3001
```

### Helius API (Solana/Raydium)
```
HELIUS_API_KEY=your_helius_api_key_here
```

---

## 🎮 Saga Uygulaması - Vercel Environment Variables

### Next.js Configuration
```
NEXT_PUBLIC_APP_URL=https://xfroranft.xyz
NODE_ENV=production
```

### Starknet Configuration
```
NEXT_PUBLIC_STARKNET_NETWORK=mainnet-alpha
NEXT_PUBLIC_LOOT_SURVIVOR_CONTRACT=0x018108b32cea514a78ef1b0e4a0753e855cdf620bc0565202c02456f618c4dc4
STARKNET_RPC_URL=https://starknet-mainnet.public.blastapi.io
```

### Bibliotheca DAO (GraphQL API)
```
BIBLIOTHECA_GRAPHQL_URL=https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql
```

### AI Services
```
# Daydreams API (GPT-4o for story generation)
INFERENCE_API_KEY=your_daydreams_api_key_here

# Replicate (FLUX.1 [dev] for comic image generation)
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Database - Supabase
```
# Aynı Supabase projesini kullanabilirsiniz veya yeni proje oluşturun
NEXT_PUBLIC_SUPABASE_URL=https://vzhclqjrqhhpyicaktpv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### Redis (Queue System) - BullMQ
```
# Upstash Redis (Önerilen - BullMQ için optimize)
UPSTASH_REDIS_URL=redis://xxxxxxxxxxxxx.upstash.io:6379
UPSTASH_REDIS_TOKEN=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# VEYA Vercel KV kullanıyorsanız (ama BullMQ için Upstash önerilir)
# KV_REST_API_URL=https://your-kv-instance.vercel.app
# KV_REST_API_TOKEN=your_kv_token_here
```

### Storage - Cloudflare R2
```
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=loot-survivor-sagas
R2_PUBLIC_URL=https://sagas.xfroranft.xyz
# VEYA Cloudflare R2 public URL kullanıyorsanız:
# R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

---

## 🔗 Saga Entegrasyonu için Özel Variable

### Ana Web Sitesi için (Saga API URL)
```
# Saga API aynı domain'de olduğu için boş bırakabilirsiniz veya:
NEXT_PUBLIC_SAGA_API_URL=https://xfroranft.xyz
```

---

## 📝 Vercel'de Environment Variables Ekleme Adımları

1. **Vercel Dashboard'a gidin**: https://vercel.com/dashboard
2. **Projenizi seçin** (xfroranft.xyz)
3. **Settings** → **Environment Variables** sekmesine gidin
4. **Her environment variable için**:
   - **Name**: Variable adını girin (yukarıdaki listeden)
   - **Value**: Gerçek değeri girin
   - **Environment**: Hangi ortamlar için geçerli olduğunu seçin:
     - ✅ **Production** (canlı site)
     - ✅ **Preview** (PR preview'ları için)
     - ✅ **Development** (local development için - opsiyonel)

5. **Save** butonuna tıklayın
6. **Redeploy** yapın (Environment variable'lar değiştiğinde redeploy gerekir)

---

## ⚠️ Önemli Notlar

### 1. **Supabase Service Role Key**
- ⚠️ **ÇOK ÖNEMLİ**: Bu key'i asla client-side'da kullanmayın!
- Sadece server-side API routes'da kullanın
- Bu key Row Level Security (RLS) bypass eder

### 2. **Redis/Queue System**
- Saga uygulaması için **Upstash Redis** önerilir (BullMQ için optimize)
- Vercel KV kullanıyorsanız, BullMQ ile uyumlu olmayabilir
- Upstash Redis URL formatı: `redis://xxxxx.upstash.io:6379`

### 3. **Cloudflare R2 Storage**
- R2 bucket'ınızı oluşturduktan sonra:
  - Public URL için custom domain kullanabilirsiniz: `sagas.xfroranft.xyz`
  - VEYA R2'nin otomatik public URL'ini kullanabilirsiniz: `https://pub-xxxxx.r2.dev`

### 4. **API Endpoints**
- Saga API'leri aynı domain'de olduğu için (`xfroranft.xyz/api/saga/...`):
  - `NEXT_PUBLIC_SAGA_API_URL` boş bırakılabilir veya `https://xfroranft.xyz` olarak ayarlanabilir
  - Frontend'de `/api/saga/...` olarak çağrılacak (relative path)

### 5. **X (Twitter) Callback URL**
- Production'da: `https://xfroranft.xyz/api/auth/x/callback`
- Twitter Developer Dashboard'da bu URL'i whitelist'e ekleyin

### 6. **Environment Variable'ları Gizli Tutun**
- ✅ Vercel'de environment variable'lar otomatik olarak gizlidir
- ❌ `.env.local` dosyasını Git'e commit etmeyin
- ✅ `.gitignore` dosyasında `.env.local` olduğundan emin olun

---

## 🧪 Test Etme

Deploy sonrası test etmek için:

1. **Ana Web Sitesi**: https://xfroranft.xyz
2. **Saga Sayfası**: https://xfroranft.xyz/saga (sadece test cüzdanı görebilir)
3. **Saga API**: https://xfroranft.xyz/api/saga/generate (POST request)

---

## 📞 Sorun Giderme

### Environment Variable'lar çalışmıyor?
1. Vercel Dashboard'da variable'ların doğru eklendiğini kontrol edin
2. **Redeploy** yapın (environment variable değişiklikleri için gerekli)
3. Vercel Logs'u kontrol edin: **Deployments** → **View Function Logs**

### Redis/Queue çalışmıyor?
1. `UPSTASH_REDIS_URL` formatını kontrol edin: `redis://xxxxx.upstash.io:6379`
2. `UPSTASH_REDIS_TOKEN` doğru mu kontrol edin
3. Upstash Dashboard'da Redis instance'ın aktif olduğunu kontrol edin

### Supabase bağlantı sorunu?
1. `NEXT_PUBLIC_SUPABASE_URL` formatını kontrol edin: `https://xxxxx.supabase.co`
2. `SUPABASE_SERVICE_ROLE_KEY` doğru mu kontrol edin
3. Supabase Dashboard'da projenin aktif olduğunu kontrol edin

---

## ✅ Checklist

Deploy öncesi kontrol listesi:

- [ ] Tüm environment variable'lar Vercel'e eklendi
- [ ] Supabase Service Role Key eklendi
- [ ] Redis/Upstash URL ve Token eklendi
- [ ] Replicate API Token eklendi
- [ ] Cloudflare R2 credentials eklendi
- [ ] X (Twitter) OAuth credentials eklendi
- [ ] Callback URL'ler production domain'e göre güncellendi
- [ ] `NEXT_PUBLIC_APP_URL` production domain'e ayarlandı
- [ ] `NEXT_PUBLIC_SAGA_API_URL` ayarlandı (veya boş bırakıldı)
- [ ] Redeploy yapıldı

---

**Son Güncelleme**: 2024
**Domain**: xfroranft.xyz

