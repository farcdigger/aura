# Torii GraphQL API Performans Optimizasyonu

## Sorun Özeti

Torii GraphQL API'de `events` sorgusu timeout alıyor. Bu sorun, raporun detaylı analizine göre veritabanı performans sorunlarından kaynaklanıyor.

## Sorunun Kökeni

### Teknik Analiz

1. **O(N) Karmaşıklığı**: `events(keys: [selector, adventurer_id])` sorgusu doğrusal karmaşıklıkta çalışır
2. **Düşük Kardinalite**: Event selector (key[0]) milyonlarca satırda aynı değere sahip
3. **Veritabanı Taraması**: JSON array içindeki elemanlar için optimize indeks kullanılamaz
4. **Full Table Scan**: Veritabanı motoru tüm tabloyu taramak zorunda kalır

### Performans Darboğazları

- **Batch Size**: 50 → 10'a düşürüldü (daha küçük sorgular)
- **Timeout**: 30s → 15s per page (toplam 60s limit)
- **Retry Mekanizması**: Exponential backoff ile 3 deneme eklendi

## Uygulanan Çözümler

### 1. Event Fetcher Optimizasyonu

**Dosya**: `src/lib/blockchain/event-fetcher.ts`

**Değişiklikler**:
- ✅ Batch size: 50 → 10
- ✅ Timeout: 30s → 15s per page
- ✅ Retry mekanizması: Exponential backoff (3 deneme)
- ✅ Daha iyi error handling
- ✅ Detaylı performans yorumları eklendi

### 2. Alternatif Yaklaşım: Model-Specific Queries

**Yeni Fonksiyon**: `fetchGameEventsAlternative()`

Bu fonksiyon `battles` ve `discoveries` sorgularını kullanır:
- **O(1) Erişim**: `adventurerId` primary key olduğu için çok hızlı
- **Fallback**: Eğer bu sorgular mevcut değilse, `events` sorgusuna geri döner

**Kullanım**:
```typescript
import { fetchGameEventsAlternative } from './event-fetcher';

// Önce alternatif yöntemi dene
try {
  const logs = await fetchGameEventsAlternative(adventurerId);
} catch {
  // Fallback to events query
  const logs = await fetchGameEvents(adventurerId);
}
```

### 3. Bibliotheca Entegrasyonu

**Dosya**: `src/lib/blockchain/bibliotheca.ts`

`fetchGameData()` fonksiyonu artık önce alternatif yöntemi deniyor:
1. `fetchGameEventsAlternative()` (battles/discoveries - O(1))
2. Fallback: `fetchGameEvents()` (events - O(N))

## Önerilen Gelecek İyileştirmeler

### 1. GraphQL Subscriptions (Real-time)

WebSocket abonelikleri kullanarak anlık güncellemeler alın:

```graphql
subscription {
  entityUpdated(id: "0xAdventurerID") {
    models {
      ... on Adventurer {
        health
        status
      }
    }
  }
}
```

### 2. Optimistic Updates

Client-side state management ile kullanıcı deneyimini iyileştirin:
- İstemci, ağdan yanıt beklemeden yerel önbellekte güncelleme yapar
- Torii'den gelen doğrulama daha sonra sessizce uygulanır

### 3. Cursor-Based Pagination (Zaten Mevcut)

✅ Cursor-based pagination zaten kullanılıyor - bu doğru yaklaşım.

### 4. Schema Discovery

Torii deployment'ında hangi sorguların mevcut olduğunu keşfetmek için:

```bash
npm run discover:schema
```

## Performans Karşılaştırması

| Yaklaşım | Karmaşıklık | Timeout Riski | Önerilen Kullanım |
|----------|-------------|---------------|-------------------|
| `events` sorgusu | O(N) | Yüksek | Sadece hata ayıklama/denetim |
| `battles/discoveries` | O(1) | Düşük | Canlı oyun arayüzü |
| GraphQL Subscriptions | O(1) | Yok | Real-time güncellemeler |

## Test Etme

### 1. Alternatif Yöntemi Test Et

```typescript
import { fetchGameEventsAlternative } from '@/lib/blockchain/event-fetcher';

const logs = await fetchGameEventsAlternative('133595');
console.log(`Fetched ${logs.length} events`);
```

### 2. Events Sorgusunu Test Et

```typescript
import { fetchGameEvents } from '@/lib/blockchain/event-fetcher';

const logs = await fetchGameEvents('133595');
console.log(`Fetched ${logs.length} events`);
```

### 3. Schema Discovery

```bash
cd loot-survivor-saga
npm run discover:schema
```

## Referanslar

- **Rapor**: "Provable Games Death Mountain Mimarisi ve Torii GraphQL API Performans Analizi"
- **Torii Docs**: https://book.dojoengine.org/toolchain/torii
- **Dojo Engine**: https://www.dojoengine.org/

## Notlar

- `events` sorgusu sadece hata ayıklama ve denetim logları için kullanılmalı
- Canlı oyun arayüzü için model-specific queries (`battles`, `discoveries`) tercih edilmeli
- Real-time güncellemeler için GraphQL subscriptions kullanılmalı
- Client-side optimistic updates ile kullanıcı deneyimi iyileştirilebilir





