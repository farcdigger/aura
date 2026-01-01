# Apibara Indexer - Basit Açıklama

## 🤔 Apibara Nedir?

**Apibara**, blockchain event'lerini kendi veritabanınıza kaydeden bir **indexer servisi**.

### Basit Benzetme:
- **Torii**: Paylaşılan bir kütüphane (herkes kullanıyor, yavaş, limitli)
- **Apibara**: Kendi özel kütüphaneniz (sadece sizin, hızlı, sınırsız)

---

## 🔄 Şu Anki Durum (Torii)

### Nasıl Çalışıyor:
```
Starknet Blockchain
    ↓
Torii Indexer (api.cartridge.gg) ← Paylaşılan servis
    ↓
GraphQL API (events query)
    ↓
Bizim Uygulama
```

### Sorun:
- ❌ **Paylaşılan servis**: Binlerce kullanıcı aynı anda kullanıyor
- ❌ **Timeout**: 10 saniye içinde cevap vermiyor
- ❌ **Limitli sorgu**: `events` query optimize edilmemiş
- ❌ **Kontrol yok**: Torii'nin altyapısını kontrol edemiyoruz

---

## ✅ Apibara ile Çözüm

### Nasıl Çalışacak:
```
Starknet Blockchain
    ↓
Apibara Indexer (KENDİ SUNUCUMUZ) ← Sadece bizim için
    ↓
MongoDB (KENDİ VERİTABANIMIZ) ← Tüm event'ler burada
    ↓
Custom GraphQL API (KENDİ API'MİZ) ← Hızlı sorgular
    ↓
Bizim Uygulama
```

### Avantajlar:
- ✅ **Kendi sunucumuz**: Sadece bizim için çalışıyor
- ✅ **Hızlı sorgular**: MongoDB indexed (O(1) erişim)
- ✅ **Tüm event'ler**: 506 event'in hepsi kayıtlı
- ✅ **Kontrol bizde**: İstediğimiz gibi optimize edebiliriz

---

## 📊 Farklar Tablosu

| Özellik | Torii (Şu An) | Apibara (Çözüm) |
|---------|---------------|-----------------|
| **Sunucu** | Paylaşılan (api.cartridge.gg) | Kendi sunucumuz |
| **Veritabanı** | Torii'nin veritabanı | MongoDB (bizim) |
| **Hız** | ❌ Timeout (>10s) | ✅ Hızlı (<1s) |
| **Event History** | ❌ Çekemiyoruz | ✅ Tüm 506 event |
| **Kontrol** | ❌ Yok | ✅ Tam kontrol |
| **Maliyet** | ✅ Ücretsiz | ⚠️ Sunucu maliyeti |
| **Setup** | ✅ Hazır | ❌ Kurulum gerekli |

---

## 🛠️ Nasıl Çalışır?

### 1. Apibara Indexer Kurulumu

```typescript
// apibara-indexer/index.ts
import { createStarknetIndexer } from "@apibara/starknet";

// Loot Survivor event'lerini dinle
const indexer = createStarknetIndexer({
  network: "mainnet",
  contract: "0x018108b32cea514a78ef1b0e4a0753e855cdf620bc0565202c02456f618c4dc4",
  events: [
    "Attack",      // Savaş event'leri
    "Discovery",   // Keşif event'leri
    "Ambush"       // Baskın event'leri
  ]
});

// Event geldiğinde MongoDB'ye kaydet
indexer.on("event", async (event) => {
  await db.events.insertOne({
    adventurerId: event.keys[1],
    eventType: event.name,
    data: event.data,
    timestamp: event.timestamp,
    txHash: event.transactionHash
  });
});
```

### 2. MongoDB'ye Kayıt

```javascript
// MongoDB'de her event kaydedilir:
{
  _id: "...",
  adventurerId: "0x209db",
  eventType: "Attack",
  data: { damage: 10, location: 5, criticalHit: false },
  timestamp: 1234567890,
  txHash: "0xabc..."
}
```

### 3. Hızlı Sorgu (GraphQL)

```graphql
# Kendi API'mizden sorgu
query GetEvents($adventurerId: String!) {
  events(
    where: { adventurerId: $adventurerId }
    orderBy: { timestamp: ASC }
    first: 506
  ) {
    id
    eventType
    data
    timestamp
  }
}
```

**Sonuç**: ✅ 506 event'i <1 saniyede çeker!

---

## 💰 Maliyet

### Torii (Şu An):
- ✅ **Ücretsiz** (ama timeout alıyor)

### Apibara:
- ⚠️ **Sunucu maliyeti**: ~$20-50/ay
  - VPS (DigitalOcean, AWS, vb.)
  - MongoDB hosting (MongoDB Atlas)
  - Apibara indexer çalıştırma

---

## ⏱️ Kurulum Süresi

### Torii:
- ✅ **0 dakika** (zaten hazır)

### Apibara:
- ⚠️ **2-3 gün** (ilk kurulum)
  - Apibara indexer setup
  - MongoDB kurulumu
  - GraphQL API yazma
  - Test ve deploy

---

## 🎯 Ne Zaman Kullanmalı?

### Torii Kullan (Şu An):
- ✅ Hızlı prototip için
- ✅ Son event yeterliyse
- ✅ Maliyet önemliyse

### Apibara Kullan (Gelecek):
- ✅ Tüm event history gerekiyorsa
- ✅ Hız kritikse
- ✅ Ölçeklenebilirlik gerekiyorsa
- ✅ Tam kontrol istiyorsanız

---

## 🔍 Özet

### Sorun:
- Torii `events` query timeout alıyor
- 506 event çekemiyoruz
- Paylaşılan servis → yavaş

### Çözüm (Apibara):
- Kendi indexer'ımız → hızlı
- MongoDB'ye kayıt → tüm event'ler
- Custom API → optimize sorgular

### Fark:
- **Torii**: Paylaşılan kütüphane (yavaş, limitli)
- **Apibara**: Özel kütüphane (hızlı, sınırsız)

---

## 📝 Sonuç

**Şu an için**: Torii ile devam edebiliriz (son event + fallback scenes)

**Gelecek için**: Apibara indexer deploy edersek:
- ✅ Tüm 506 event'i çekebiliriz
- ✅ Hızlı sorgular (<1s)
- ✅ Tam kontrol

**Maliyet**: ~$20-50/ay sunucu maliyeti

**Kurulum**: 2-3 gün (ilk sefer)





