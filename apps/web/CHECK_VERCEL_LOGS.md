# Vercel Logs Nasıl Kontrol Edilir

## Problem
Payment header doğru oluşturuluyor ama middleware hala 402 dönüyor.
Bu, middleware'in CDP facilitator'a bağlanamadığı anlamına gelir.

## Çözüm: Vercel Logs'u Kontrol Et

### 1. Vercel CLI ile (Önerilen)
```bash
# Vercel CLI yükle (yoksa)
npm i -g vercel

# Login
vercel login

# Real-time logs
vercel logs --follow

# Ya da son 100 log
vercel logs -n 100
```

### 2. Vercel Dashboard ile
1. https://vercel.com/dashboard adresine git
2. Projenizi seçin
3. **Logs** sekmesine tıklayın
4. Son deployment'ın log'larını görün

### 3. Ne Aramalısınız

Middleware log'larında şunları arayın:

**BAŞARILI (Olması Gereken):**
```
✅ CDP Facilitator verified payment
✅ USDC transfer executed
✅ Payment verified, allowing request
```

**BAŞARISIZ (Muhtemelen Göreceksiniz):**
```
❌ CDP_API_KEY_ID not found
❌ CDP_API_KEY_SECRET not found
❌ Facilitator configuration error
❌ Failed to verify payment
```

### 4. Environment Variables Kontrol

Vercel Dashboard → Settings → Environment Variables:

**Kontrol edilecekler:**
- [ ] `CDP_API_KEY_ID` var mı?
- [ ] `CDP_API_KEY_SECRET` var mı?
- [ ] Her ikisi de **Production** için ayarlı mı?
- [ ] Her ikisi de **Preview** için ayarlı mı?
- [ ] Son deployment bu değişkenlerden SONRA mı yapıldı?

### 5. CDP Keys Nasıl Alınır

1. https://portal.cdp.coinbase.com/ adresine git
2. Sign in / Sign up
3. **API Keys** bölümüne git
4. **Create API Key** tıkla
5. Key adı: "xFrora NFT x402 Facilitator"
6. **Permissions**: x402 iznini seç (önemli!)
7. `CDP_API_KEY_ID` ve `CDP_API_KEY_SECRET` değerlerini kopyala
8. Vercel'de ayarla

### 6. Yeniden Deploy

Environment variables ekledikten sonra:

**Vercel Dashboard'dan:**
1. Deployments sekmesi
2. Son deployment'ın sağındaki "..." menü
3. "Redeploy" tıkla
4. "Use existing Build Cache" seçeneğini **KALDIRIN**
5. Redeploy butonuna tıkla

**CLI'dan:**
```bash
vercel --prod --force
```

### 7. Test

Deploy tamamlandıktan sonra:
1. Sayfayı hard refresh (Cmd+Shift+R)
2. Mint butonuna tıkla
3. İmzayı onayla
4. Vercel logs'u izle:
   ```bash
   vercel logs --follow
   ```
5. Middleware'in başarılı log vermesini bekle

## Hala Çalışmıyorsa

Eğer CDP keys doğru ama hala çalışmıyorsa:

1. **Network kontrolü**: Base Mainnet'te misiniz? (MetaMask'ta kontrol edin)
2. **USDC balance**: Cüzdanda en az 0.1 USDC var mı?
3. **Contract address**: Middleware'deki recipient address doğru mu?
   - `0x5305538F1922B69722BBE2C1B84869Fd27Abb4BF`

## Destek

Vercel logs'u paylaşın:
```bash
vercel logs -n 50 > logs.txt
```

Bu dosyayı gönderin, sorunu birlikte çözelim.

