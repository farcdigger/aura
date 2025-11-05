# Vercel Environment Variables Kontrol Listesi

## ÖNEMLİ: Middleware'in çalışması için bu değişkenlerin MUTLAKA ayarlanması gerekiyor!

Vercel Dashboard → Project Settings → Environment Variables:

### 1. CDP API Keys (ZORUNLU - Middleware için)
```
CDP_API_KEY_ID=<your-cdp-api-key-id>
CDP_API_KEY_SECRET=<your-cdp-api-key-secret>
```

**Nasıl alınır:**
1. https://portal.cdp.coinbase.com/ adresine git
2. API Keys bölümünden yeni key oluştur
3. `CDP_API_KEY_ID` ve `CDP_API_KEY_SECRET` değerlerini kopyala
4. Vercel'de **Production**, **Preview** ve **Development** ortamları için ayarla

### 2. Diğer Gerekli Variables
```
X402_PRICE_USDC=100000  # 0.1 USDC (6 decimals)
NEXT_PUBLIC_CHAIN_ID=8453  # Base Mainnet
```

## Kontrol:
1. Vercel Dashboard'da tüm environment variables ayarlı mı?
2. CDP_API_KEY_ID ve CDP_API_KEY_SECRET değerleri doğru mu?
3. Son deployment'tan sonra yeniden deploy edildi mi? (env vars için)

## Test:
```bash
# Vercel'de çalışan middleware log'larını kontrol et:
vercel logs --follow
```

## Hata: "error: {}"
Bu hata, middleware'in CDP facilitator'a bağlanamadığı anlamına gelir.
Muhtemel sebepler:
1. CDP_API_KEY_ID veya CDP_API_KEY_SECRET eksik/yanlış
2. Vercel'de env vars ayarlandıktan sonra yeniden deploy edilmedi
3. CDP API keys'lerin izinleri yok (x402 permission gerekli)

