# CDP API KEYS KONTROLÜ

## ⚠️ KRİTİK: CDP API Keys Eksik veya Yanlış!

Middleware sürekli 402 dönüyorsa, **%99 CDP API keys sorunu var**.

## 1. Vercel Environment Variables Kontrol

https://vercel.com/your-project/settings/environment-variables

**MUTLAKA OLMASI GEREKENLER:**

```bash
CDP_API_KEY_ID=organizations/YOUR_ORG_ID/apiKeys/YOUR_KEY_ID
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

**ÖNEMLİ:**
- `CDP_API_KEY_ID` → **"organizations/..."** ile başlamalı (tam path)
- `CDP_API_KEY_SECRET` → **"-----BEGIN EC PRIVATE KEY-----"** ile başlamalı (PEM formatı)
- Her iki key de **Production**, **Preview**, **Development** için ayrı ayrı eklenmiş olmalı!

## 2. CDP Portal'de Key Oluşturma

1. Git: https://portal.cdp.coinbase.com/
2. **API Keys** → **Create API Key**
3. **Name:** "x402-production"
4. **Permissions:** ✅ **x402** seçili olmalı!
5. **Create** → Keys'leri kopyala

## 3. Vercel'de Ekleme

```bash
# Vercel Dashboard
Settings → Environment Variables → Add

# Variable 1
Name: CDP_API_KEY_ID
Value: organizations/abc-123/apiKeys/xyz-789
Environments: ✅ Production ✅ Preview ✅ Development

# Variable 2  
Name: CDP_API_KEY_SECRET
Value: -----BEGIN EC PRIVATE KEY-----
MHcCAQ...
-----END EC PRIVATE KEY-----
Environments: ✅ Production ✅ Preview ✅ Development
```

## 4. Redeploy (ZORUNLU!)

Keys ekledikten sonra **MUTLAKA redeploy et:**

1. Vercel Dashboard → **Deployments**
2. Latest deployment → **⋯** → **Redeploy**
3. ⚠️ **"Use existing Build Cache"** → **KAPAT!**

## 5. Test

```bash
# Vercel logs
vercel logs --follow

# Middleware çalışırsa göreceksin:
✅ CDP Facilitator initialized
✅ Payment verified
✅ USDC transfer executed
```

## 6. Sorun Devam Ederse

**Middleware kendi EIP-712 formatını kullanıyor olabilir!**

`x402-next` package'ı kendi payment validation logic'i var. CDP keys doğruysa ama hala 402 dönüyorsa:

1. **Middleware'in beklediği format nedir?**
2. **`@coinbase/x402` facilitator ne bekliyor?**
3. **EIP-712 signature doğru format mi?**

---

## ÖZET

1. ✅ CDP Portal'de API key oluştur (x402 permission ile)
2. ✅ Vercel'e ekle (Production + Preview + Development)
3. ✅ Redeploy (build cache temizle)
4. ✅ Test et
5. ❌ Hala 402? → Vercel logs kontrol et

**Vercel logs'u paylaş, middleware'in hata mesajını görelim!**

