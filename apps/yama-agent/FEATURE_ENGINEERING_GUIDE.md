# 🧮 Feature Engineering Pipeline - Kullanım Kılavuzu

## 📋 Genel Bakış

Bu sistem, The Graph'tan Uniswap V3 verilerini çekip, feature engineering teknikleriyle işleyip, Supabase'e kaydeden bir pipeline'dır.

## 🚀 Kurulum

### 1. Supabase Şemasını Oluştur

Supabase Dashboard → SQL Editor'a git ve `apps/yama-agent/src/lib/supabase-schema.sql` dosyasındaki SQL'i çalıştır.

### 2. Environment Variables

`apps/yama-agent/.env` dosyasına şunları ekle:

```env
THE_GRAPH_API_KEY=your_graph_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Not:** Eğer `SUPABASE_URL` yoksa, `NEXT_PUBLIC_SUPABASE_URL` de kullanılabilir (web app'ten sync edilmişse).

## 📊 Veri Akışı

```
The Graph → Data Fetcher → Feature Engineering → Supabase
```

### 1. **Data Fetcher** (`data-fetcher.ts`)
- 24 saatlik verileri çeker:
  - **Pools**: Top 50 pool (TVL'e göre)
  - **Swaps**: Son 24 saatteki tüm swap'ler (max 1000)
  - **Mints**: Likidite eklemeleri (max 500)
  - **Burns**: Likidite çekmeleri (max 500)
  - **Collects**: Fee toplamaları (max 500)

### 2. **Feature Engineering** (`feature-engineering.ts`)
Ham verilerden şu metrikleri üretir:

#### Pool-Level Metrikler:
- **Liquidity Efficiency Score** (0-100): Volume/TVL oranı
- **Liquidity Flow Velocity**: USD/saat likidite değişim hızı
- **Activity Score** (0-100): Normalize edilmiş işlem sayısı
- **Price Volatility**: 24 saatlik fiyat volatilitesi
- **Liquidity Depth Score** (0-100): Mint/Burn oranı
- **Fee Yield Rate**: Yıllıklaştırılmış fee getirisi

#### Market-Level Metrikler:
- **Protocol Health Score** (0-100): Genel protokol sağlığı
- **Liquidity Efficiency Index**: Ortalama likidite verimliliği
- **Net Liquidity Flow**: Toplam mint - burn (USD)
- **Swap Frequency**: Saatlik swap sıklığı

#### Behavioral Signals:
- **Whale Activity Score** (0-100): Büyük işlem aktivitesi
- **Smart Money Momentum** (-100 to 100): Akıllı para akış yönü
- **User Retention Index**: Kullanıcı sadakati

#### Anomaly Detection:
- **Volume Spike**: Anormal hacim artışları
- **Liquidity Drain**: Büyük likidite çekmeleri
- **Price Divergence**: Fiyat uyumsuzlukları

### 3. **Data Storage** (`data-storage.ts`)
Tüm verileri Supabase'e kaydeder:
- Raw data tabloları (time-series)
- Engineered features
- Anomalies

## 🎯 Kullanım

### Entrypoint'ler

#### 1. `fetch-and-process`
Tüm veriyi çek, işle ve kaydet:

```bash
# GET request
curl "http://localhost:3001/entrypoints/fetch-and-process/invoke?poolsLimit=50&swapsLimit=1000"

# POST request
curl -X POST "http://localhost:3001/entrypoints/fetch-and-process/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "poolsLimit": 50,
      "swapsLimit": 1000,
      "mintsLimit": 500,
      "burnsLimit": 500,
      "collectsLimit": 500
    }
  }'
```

#### 2. `get-features`
Supabase'den engineered features'ları getir:

```bash
# Tüm feature'ları getir
curl "http://localhost:3001/entrypoints/get-features/invoke?limit=10"

# Sadece market metrics
curl "http://localhost:3001/entrypoints/get-features/invoke?featureType=market_metrics"

# Belirli bir pool için
curl "http://localhost:3001/entrypoints/get-features/invoke?featureType=pool_metrics&poolId=0x..."
```

## 📈 Örnek Çıktı

```json
{
  "output": {
    "success": true,
    "summary": {
      "pools": 50,
      "swaps": 1234,
      "mints": 456,
      "burns": 234,
      "collects": 123,
      "poolMetrics": 50,
      "anomalies": 3,
      "marketHealth": 78.5
    },
    "features": {
      "marketMetrics": {
        "totalVolume24hUSD": 123456789,
        "totalTVLUSD": 987654321,
        "protocolHealthScore": 78.5,
        "liquidityFlowDirection": "inflow"
      },
      "behavioralSignals": {
        "whaleActivityScore": 45.2,
        "smartMoneyMomentum": 62.3
      },
      "anomalies": [
        {
          "type": "volume_spike",
          "severity": "high",
          "poolId": "0x...",
          "description": "Volume spike detected in WETH/USDC"
        }
      ]
    }
  }
}
```

## 🔄 Otomasyon (24 Saatte Bir)

İleride cron job veya scheduled task ekleyebilirsin:

```typescript
// Örnek: Her 24 saatte bir çalıştır
setInterval(async () => {
  await fetchAndProcess();
}, 24 * 60 * 60 * 1000);
```

## 💡 Feature Engineering İyileştirmeleri

Şu anki metrikler temel seviyede. İleride eklenebilecekler:

1. **Historical Analysis**: 7 günlük, 30 günlük trendler
2. **Correlation Analysis**: Pool'lar arası korelasyon
3. **ML-Based Anomaly Detection**: Isolation Forest, LSTM
4. **User Segmentation**: Whale, retail, bot kategorileri
5. **Arbitrage Detection**: Cross-pool arbitraj fırsatları
6. **Liquidity Risk Score**: Slippage ve impermanent loss riski

## 📝 Notlar

- The Graph API limitleri: Free tier'da günlük 100k query
- Supabase storage: Veri miktarına göre plan seç
- Feature engineering hesaplamaları CPU-intensive olabilir, büyük veri setlerinde dikkatli ol

## 🐛 Troubleshooting

### "Supabase credentials not found"
→ `.env` dosyasında `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` kontrol et

### "Failed to fetch pools"
→ `THE_GRAPH_API_KEY` kontrol et, API limitlerini kontrol et

### "Table does not exist"
→ Supabase SQL Editor'da şema SQL'ini çalıştırdığından emin ol
























































