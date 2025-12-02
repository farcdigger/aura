# Subgraph Araştırma Rehberi

Bu rehber, yeni bir subgraph'ın raporlarımıza uygun olup olmadığını araştırmak için hazırlanmıştır.

## 🎯 Amaç

Yeni bir subgraph eklemeden önce:
- Hangi verilerin mevcut olduğunu öğrenmek
- Veri yapısını anlamak
- Raporlarımız için yararlı olup olmadığını belirlemek

## 🚀 Kullanım

### Adım 1: Subgraph ID veya URL'sini Bulun

The Graph Explorer'dan subgraph'ın ID'sini veya URL'sini alın.

### Adım 2: Araştırma Scriptini Çalıştırın

```bash
# Subgraph ID ile
bun run investigate <subgraph_id>

# Veya tam URL ile
bun run investigate https://api.thegraph.com/subgraphs/name/...
```

### Adım 3: Sonuçları İnceleyin

Script şu bilgileri gösterecek:

#### 📊 Mevcut Varlıklar (Entities)
- Subgraph'ta hangi varlıkların sorgulanabilir olduğu
- Her varlığın tipi ve yapısı

#### 🤔 Protokol Tipi Tahmini
- DEX, Lending, NFT, Staking vb. olabilir
- Otomatik olarak tahmin edilir

#### 🔎 Ortak Desenler
- Bilinen entity isimlerinin varlığı kontrolü
- Standart DeFi/NFT yapılarının tespiti

#### 📦 Anahtar Varlıkların Detayları
- Her varlığın alanları (fields)
- Örnek veri yapısı
- İlk kayıtlardan örnekler

## 📋 Değerlendirme Kriterleri

### ✅ İyi İşaretler

1. **Zaman Damgası Alanları Var**
   - `timestamp`, `blockTimestamp`, `createdAt` gibi alanlar
   - Son 12 saatin verilerini filtrelemek için gerekli

2. **Anlamlı Veri Hacmi**
   - Örnek sorgularda veri dönüyor
   - Boş değil, aktif kullanımda

3. **İlgili Metrikler**
   - DEX için: swaps, volume, liquidity
   - Lending için: borrows, deposits, rates
   - NFT için: transfers, sales, collections

4. **İyi Yapılandırılmış**
   - Anlaşılır entity isimleri
   - Mantıklı ilişkiler (relations)
   - USD değerleri varsa büyük artı

### ⚠️ Dikkat Edilmesi Gerekenler

1. **Zaman Filtresi Yok**
   - Bazı subgraph'larda timestamp filtreleme çalışmayabilir
   - Alternatif yaklaşımlar gerekebilir

2. **Karmaşık Yapı**
   - Çok fazla nested ilişki
   - Verileri parse etmek zor olabilir

3. **Düşük Veri Kalitesi**
   - Eksik alanlar çok
   - USD değerleri yok
   - Metadata eksik

### ❌ Kötü İşaretler

1. **Hiç Veri Yok**
   - Empty subgraph
   - Indexing problemi olabilir

2. **Uyumsuz Protokol Tipi**
   - Mevcut rapor yapımıza uymuyor
   - Farklı bir use case için tasarlanmış

3. **Deprecated/Eski**
   - Güncelleme almıyor
   - V2/V3 versiyonu çıkmış

## 🛠️ Ekleme Süreci

### 1. Subgraph Config Ekle

`apps/yama-agent/src/lib/subgraph-config.ts`:

```typescript
export const SUBGRAPH_CONFIGS: Record<string, SubgraphConfig> = {
  // ... mevcut config'ler
  
  newProtocol_mainnet: {
    id: 'SUBGRAPH_ID_BURAYA',
    name: 'Protocol İsmi',
    protocol: 'protocol-slug',
    network: 'mainnet',
    type: 'dex', // veya 'lending', 'nft', vb.
  },
};
```

### 2. Fetch Fonksiyonu Oluştur

`apps/yama-agent/src/lib/multi-protocol-fetcher.ts`:

Protokol tipine göre uygun fetch fonksiyonu oluşturun:
- `fetchDEXSwaps` - DEX için
- `fetchLendingData` - Lending için  
- `fetchNFTData` - NFT için

### 3. Storage Logic Ekle

`apps/yama-agent/src/lib/multi-protocol-storage.ts`:

Verileri Supabase'e kaydetmek için logic ekleyin.

### 4. Rapor Güncellemeleri

`apps/yama-agent/src/lib/agent.ts`:

Yeni verileri rapora dahil etmek için summary fonksiyonları ekleyin.

### 5. SQL Schema (Gerekirse)

Yeni bir tablo gerekiyorsa `apps/yama-agent/src/lib/` altında schema dosyası oluşturun.

## 🧪 Test Queries

Subgraph'ı manuel olarak test etmek için The Graph Playground'da deneyin:

```graphql
# Örnek: Son transferleri çek
{
  transfers(
    first: 10
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: "1733000000" }
  ) {
    id
    from
    to
    amount
    timestamp
  }
}
```

## 📚 Örnek Protokol Tipleri

### DEX (Decentralized Exchange)
- **Varlıklar**: swaps, pools, pairs, liquidityPositions
- **Metrikler**: volume, liquidity, price
- **Örnek**: Uniswap, SushiSwap

### Lending
- **Varlıklar**: markets, borrows, deposits, liquidations
- **Metrikler**: borrowRate, depositRate, utilization
- **Örnek**: Aave, Compound

### NFT
- **Varlıklar**: collections, tokens, transfers, sales
- **Metrikler**: floorPrice, volume, holders
- **Örnek**: Art Blocks, OpenSea

### Staking
- **Varlıklar**: validators, delegators, stakes, rewards
- **Metrikler**: APY, totalStaked, rewards
- **Örnek**: Lido, Rocket Pool

## 💡 İpuçları

1. **Küçük Başla**: Önce basit bir query ile test et
2. **Zaman Filtreleri**: Mutlaka test et (bazı subgraph'larda çalışmıyor)
3. **Limit Kullan**: İlk testlerde `first: 10` gibi küçük limitler kullan
4. **Dokümantasyon**: Subgraph'ın kendi dokümantasyonunu oku
5. **Topluluk**: The Graph Discord'da soru sor

## 🆘 Sorun Giderme

### "No data returned"
- Subgraph boş olabilir
- Query syntax'ı yanlış olabilir
- Zaman filtresi çalışmıyor olabilir

### "Field not found"
- Entity ismini kontrol et (büyük/küçük harf)
- Introspection sonuçlarını tekrar gözden geçir

### "Query timeout"
- Limit'i azalt
- Daha spesifik filtreler kullan
- Subgraph overloaded olabilir

## 📞 Yardım

Sorularınız için:
- The Graph Discord: https://discord.gg/thegraph
- Subgraph Dokümantasyonu: Her subgraph'ın kendi docs'u var
- Team'e sor: Takım arkadaşlarına danış

---

**Son Güncelleme**: Aralık 2024
**Versiyon**: 1.0

