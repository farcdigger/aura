# 🔍 Yeni Subgraph Araştırma Kılavuzu

Bu dokümantasyon, yeni bir subgraph eklemek için gereken araştırma sürecini açıklar.

## ✅ Yapılan Değişiklikler

### 1. Art Blocks NFT Pool Devre Dışı Bırakıldı

`apps/yama-agent/src/lib/subgraph-config.ts` dosyasında Art Blocks NFT pool yoruma alındı:

```typescript
// Art Blocks NFT pool temporarily disabled - will be replaced with new subgraph
// artBlocks_mainnet: { ... }
```

Şu an aktif subgraph'lar:
- ✅ **Uniswap V3** (DEX) - Mainnet

## 🛠️ Yeni Araştırma Araçları

### 1. Comprehensive Investigation Script

Yeni bir subgraph'ı detaylıca araştırır:

```bash
cd apps/yama-agent

# Subgraph ID ile
bun run investigate <SUBGRAPH_ID>

# Örnek
bun run investigate 5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV
```

**Ne yapar:**
- 📊 Tüm mevcut entity'leri listeler
- 🤔 Protokol tipini otomatik tahmin eder (DEX, Lending, NFT, vb.)
- 🔎 Ortak veri desenlerini kontrol eder
- 📦 Her entity'nin alanlarını gösterir
- 📝 Örnek veri getirir
- 💡 Ekleme önerileri sunar

### 2. Quick Query Tester

Belirli bir query'yi hızlıca test eder:

```bash
# Direct query string
bun run test-query <SUBGRAPH_ID> "{ pools(first: 5) { id } }"

# GraphQL dosyasından
bun run test-query <SUBGRAPH_ID> test-queries-example.graphql
```

**Ne yapar:**
- ⚡ Query'yi çalıştırır
- ⏱️ Süresini ölçer
- 📊 Sonucu formatlar
- 📦 Veri boyutunu gösterir
- ❌ Hataları detaylı açıklar

## 📋 Araştırma Süreci

### Adım 1: Subgraph'ı Bul

1. [The Graph Explorer](https://thegraph.com/explorer)'a git
2. İlgilendiğiniz subgraph'ı bulun
3. Subgraph ID'sini kopyalayın (uzun hash string)

Alternatif olarak:
- Proje dokümantasyonundan subgraph URL'ini alın
- The Graph Discord'da sorun

### Adım 2: İlk Araştırma

```bash
cd apps/yama-agent
bun run investigate <SUBGRAPH_ID>
```

**Dikkat edilmesi gerekenler:**

✅ **İyi İşaretler:**
- [ ] Zaman damgası alanları var (`timestamp`, `blockTimestamp`)
- [ ] Örnek veriler dönüyor (boş değil)
- [ ] USD değerleri mevcut
- [ ] Anlaşılır entity isimleri
- [ ] İlgili metrikler var (volume, liquidity, vb.)

❌ **Kötü İşaretler:**
- [ ] Hiç veri yok
- [ ] Timestamp filtreleme çalışmıyor
- [ ] Çok karmaşık yapı
- [ ] Deprecated/eski subgraph

### Adım 3: Özel Query Testleri

Zaman filtrelerini test edin:

```bash
# 1. Önce Unix timestamp hesapla (12 saat önce)
# JavaScript: Math.floor((Date.now() - 12*60*60*1000) / 1000)

# 2. Query'yi test et
bun run test-query <SUBGRAPH_ID> '{
  transfers(
    first: 10
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: "TIMESTAMP_BURAYA" }
  ) {
    id
    timestamp
  }
}'
```

**Test edilmesi gerekenler:**
- [ ] `timestamp_gte` çalışıyor mu?
- [ ] `blockTimestamp_gte` alternatifi var mı?
- [ ] `orderBy` hangi alanlarla çalışıyor?
- [ ] `first` parametresi maksimum değeri ne?

### Adım 4: Veri Yapısını Anla

Önemli entity'ler için detaylı query yazın:

```graphql
{
  entityName(first: 3, orderBy: timestamp, orderDirection: desc) {
    # Tüm önemli alanları ekle
    id
    timestamp
    amount
    amountUSD
    # İlişkili entity'ler
    relatedEntity {
      id
      name
    }
  }
}
```

**Kontrol listesi:**
- [ ] Hangi alanlar dolu, hangisi boş?
- [ ] USD değerleri doğru mu?
- [ ] İlişkili entity'ler düzgün çalışıyor mu?
- [ ] Veri kalitesi yeterli mi?

### Adım 5: Karar Ver

**EVET - Ekle**, eğer:
- ✅ Zaman filtreleme çalışıyor
- ✅ İlgili metrikler var
- ✅ Veri kalitesi iyi
- ✅ Raporlara değer katacak

**HAYIR - Ekleme**, eğer:
- ❌ Veriler yetersiz
- ❌ Zaman filtreleme yok
- ❌ Çok karmaşık/uyumsuz
- ❌ Raporlara uygun değil

**BELKİ - Daha Fazla Araştır**, eğer:
- ⚠️ Kısmi veri var
- ⚠️ Alternatif yaklaşım gerekli
- ⚠️ Özel implementasyon gerekiyor

## 🔧 Subgraph Ekleme (Onaylandıysa)

### 1. Config Ekle

`apps/yama-agent/src/lib/subgraph-config.ts`:

```typescript
export const SUBGRAPH_CONFIGS: Record<string, SubgraphConfig> = {
  // ... mevcut config'ler
  
  newProtocol_network: {
    id: 'SUBGRAPH_ID_BURAYA',
    name: 'Protocol Name (Network)',
    protocol: 'protocol-slug',
    network: 'mainnet', // veya 'base', 'arbitrum', vb.
    type: 'dex', // veya 'lending', 'nft', 'staking', vb.
  },
};
```

### 2. Fetch Function Oluştur

`apps/yama-agent/src/lib/multi-protocol-fetcher.ts`:

Protokol tipine göre uygun yerde implement edin:

**DEX için:**
```typescript
// fetchDEXSwaps fonksiyonunu kullan veya genişlet
```

**Lending için:**
```typescript
// fetchLendingData fonksiyonunu kullan veya genişlet
```

**NFT için:**
```typescript
// fetchNFTData fonksiyonunu kullan veya genişlet
```

**Yeni tip için:**
```typescript
export async function fetchNewTypeData(
  subgraphConfig: SubgraphConfig,
  limit: number = DEFAULT_LIMIT
): Promise<any[]> {
  const client = getGraphClient(subgraphConfig);
  const timestamp = get12HoursAgoTimestamp();
  
  // Query logic buraya
  
  return data.map(item => ({
    ...item,
    _protocol: subgraphConfig.protocol,
    _network: subgraphConfig.network,
  }));
}
```

### 3. Storage Logic

`apps/yama-agent/src/lib/multi-protocol-storage.ts`:

Verileri Supabase'e kaydetmek için:

```typescript
// Uygun save fonksiyonuna ekle veya yeni oluştur
```

### 4. Rapor Entegrasyonu

`apps/yama-agent/src/lib/agent.ts`:

Summary fonksiyonlarını güncelle:

```typescript
// summarizeDexData, summarizeLendingData, summarizeNFTData
// veya yeni summarize fonksiyonu oluştur
```

### 5. SQL Schema (Gerekirse)

Yeni tablo gerekiyorsa:

```sql
-- apps/yama-agent/src/lib/supabase-schema-<protocol>.sql

CREATE TABLE IF NOT EXISTS graph_<protocol>_data (
  id BIGSERIAL PRIMARY KEY,
  -- Alanlar buraya
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 📚 Referans Dosyalar

### Dokümantasyon
- `SUBGRAPH_INVESTIGATION_GUIDE.md` - Detaylı rehber
- `NEW_SUBGRAPH_INVESTIGATION.md` - Bu dosya
- `test-queries-example.graphql` - Örnek query'ler

### Scriptler
- `scripts/investigate-new-subgraph.ts` - Ana araştırma scripti
- `scripts/test-subgraph-query.ts` - Query test scripti
- `scripts/check-new-protocols.ts` - Mevcut protokol kontrolü

### Implementasyon
- `src/lib/subgraph-config.ts` - Subgraph yapılandırmaları
- `src/lib/multi-protocol-fetcher.ts` - Veri çekme logic
- `src/lib/multi-protocol-storage.ts` - Veri saklama logic
- `src/lib/agent.ts` - Rapor oluşturma

## 🧪 Test Etme

### Lokal Test

```bash
# 1. Environment değişkenlerini ayarla
# .env dosyasına THE_GRAPH_API_KEY ekle

# 2. Fetch test et
bun run dev

# 3. Endpoint'i çağır (başka terminal)
curl http://localhost:3000/entrypoints/fetch-and-analyze-raw/invoke
```

### Production'a Alma

1. **Önce staging'de test et**
2. **Küçük limit ile başla** (örn: 1000)
3. **Logları izle**
4. **Veri kalitesini kontrol et**
5. **Raporları incele**

## 🆘 Yaygın Sorunlar

### "timestamp_gte not working"

**Çözüm 1:** `blockTimestamp_gte` dene
```graphql
where: { blockTimestamp_gte: "..." }
```

**Çözüm 2:** Zaman filtresi kullanma, hepsini çek sonra JS'de filtrele
```typescript
const recent = data.filter(item => 
  parseInt(item.timestamp) >= timestamp12HoursAgo
);
```

### "No data returned"

**Kontroller:**
1. Subgraph boş mu? → Explorer'da kontrol et
2. Query syntax doğru mu? → `test-query` ile test et
3. Entity ismi doğru mu? → `investigate` ile kontrol et
4. Limit çok düşük mü? → `first: 100` dene

### "Query timeout"

**Çözümler:**
1. Limit'i azalt
2. Daha spesifik filtreler ekle
3. Pagination kullan
4. Gereksiz nested query'leri çıkar

### "Type errors"

**Çözümler:**
1. TypeScript type'ları güncelle
2. `any` kullan geçici olarak
3. Response structure'ı console.log ile incele

## 💡 Pro İpuçları

1. **The Graph Playground Kullan**
   - Subgraph sayfasında "Playground" butonu var
   - Canlı test edebilirsiniz
   - Auto-complete var

2. **Pagination Stratejisi**
   ```typescript
   // İlk 5000 kayıt için
   async function fetchWithPagination(query, limit) {
     const pageSize = 1000;
     const results = [];
     for (let skip = 0; skip < limit; skip += pageSize) {
       const page = await client.request(query(pageSize, skip));
       results.push(...page);
     }
     return results;
   }
   ```

3. **Veri Validasyonu**
   ```typescript
   // Null/undefined kontrolü
   const cleanData = rawData.filter(item => 
     item.id && item.timestamp && item.amountUSD
   );
   ```

4. **Rate Limiting**
   - The Graph'ta rate limit var
   - Production'da API key kullan
   - Batch request'leri optimize et

## 📞 Destek

**Sorularınız için:**
- 📖 [The Graph Docs](https://thegraph.com/docs/)
- 💬 [The Graph Discord](https://discord.gg/thegraph)
- 🐦 [@graphprotocol](https://twitter.com/graphprotocol)

**Proje içi:**
- Team'e danışın
- Existing implementations'ları inceleyin
- Log'ları detaylı tutun

---

## ✅ Sonraki Adımlar

1. **Yeni subgraph URL/ID'sini paylaşın**
2. **`bun run investigate` ile araştırın**
3. **Sonuçları inceleyin**
4. **Birlikte karar verelim**
5. **Gerekirse implement edelim**

**Hazırsanız, yeni subgraph bilgilerini paylaşın! 🚀**

