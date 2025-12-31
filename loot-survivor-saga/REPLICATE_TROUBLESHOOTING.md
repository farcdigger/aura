# Replicate 402 Payment Required Hatası - Troubleshooting

## Sorun
Replicate API'den `402 Payment Required` hatası alıyorsunuz, ancak kredi kartı bağlı ve pay-as-you-go modeli kullanıyorsunuz.

## Kontrol Listesi

### 1. API Token Kontrolü
- `.env.local` dosyasında `REPLICATE_API_TOKEN` doğru mu?
- Token formatı: `r8_` ile başlamalı
- Token'ı https://replicate.com/account/api-tokens adresinden kontrol edin

### 2. Replicate Hesap Durumu
- https://replicate.com/account/billing adresine gidin
- Kredi kartı **onaylanmış** mı? (Bazen onay süreci 24 saat sürebilir)
- Hesapta **aktif kredi** var mı? (Pay-as-you-go için bile minimum kredi gerekebilir)

### 3. İlk Kredi Yüklemesi
- Replicate bazen ilk kullanımda minimum kredi yüklemesi ister ($5-10)
- Billing sayfasında "Add Credits" butonuna tıklayın
- İlk kredi yüklemesi yapıldı mı?

### 4. Environment Variable Kontrolü
```bash
# Terminal'de kontrol edin:
cd loot-survivor-saga
cat .env.local | grep REPLICATE
```

Çıktı şöyle olmalı:
```
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. Server Restart
Environment variable değişikliklerinden sonra server'ı yeniden başlatın:
```bash
# Ctrl+C ile durdurun
npm run dev
```

### 6. Replicate Dashboard Kontrolü
- https://replicate.com/account/predictions adresine gidin
- Son API çağrılarını kontrol edin
- Hata mesajlarını inceleyin

### 7. API Token Permissions
- Token'ın doğru scope'lara sahip olduğundan emin olun
- Yeni bir token oluşturmayı deneyin: https://replicate.com/account/api-tokens

## Hızlı Test

Replicate API'nin çalışıp çalışmadığını test etmek için:

```bash
curl -X POST https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions \
  -H "Authorization: Token YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "a simple test image",
      "width": 512,
      "height": 512
    }
  }'
```

Eğer 402 hatası alırsanız, billing sayfasına gidin ve kredi ekleyin.

## Yaygın Çözümler

1. **İlk kredi yüklemesi yapın**: Billing sayfasından minimum $5-10 kredi ekleyin
2. **Kredi kartı onayını bekleyin**: Bazen 24 saat sürebilir
3. **Yeni API token oluşturun**: Eski token'da sorun olabilir
4. **Server'ı yeniden başlatın**: Environment variable değişiklikleri için

## Destek

Hala sorun varsa:
- Replicate Support: https://replicate.com/support
- Discord: https://discord.gg/replicate






