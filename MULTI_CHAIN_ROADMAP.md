# Multi-Chain Entegrasyonu Yol Haritası (Base + BSC)
## Deep Research - 1 Aylık Implementation Planı

---

## 📊 Proje Özeti

**Hedef:** Solana tabanlı Deep Research ürününe Base ve BSC ağlarını eklemek  
**Timeline:** 1 ay  
**API Plan:** Lite (1.5M CU/ay, 15 RPS toplam)  
**Yaklaşım:** Base önce, sonra BSC (EVM mimarisi ortak olduğu için BSC daha hızlı olacak)

---

## 🎯 Faz 1: Temel Altyapı ve Network Support (Hafta 1)

### 1.1 Types ve Interface Güncellemeleri
**Dosya:** `apps/solana-liquidity-agent/src/lib/types.ts`

**Yapılacaklar:**
- [ ] `Network` type tanımı: `'solana' | 'base' | 'bsc'`
- [ ] `QueueJobData` interface'ine `network: Network` field'ı ekle
- [ ] `ParsedSwap` interface'ini EVM formatını destekleyecek şekilde genişlet
- [ ] `TokenMetadata` interface'ine network bilgisi ekle (opsiyonel)

**Kod Örneği:**
```typescript
export type Network = 'solana' | 'base' | 'bsc';

export interface QueueJobData {
  poolId: string;
  tokenMint?: string;
  network: Network; // YENİ
  userId?: string;
  userWallet?: string;
  options?: {
    transactionLimit?: number;
    skipCache?: boolean;
  };
}
```

### 1.2 Birdeye Client Network-Aware Yapma
**Dosya:** `apps/solana-liquidity-agent/src/lib/birdeye-client.ts`

**Yapılacaklar:**
- [ ] Constructor'a `network: Network` parametresi ekle
- [ ] `getChainHeader()` helper method ekle
- [ ] Tüm API çağrılarında `x-chain` header'ını dinamik yap
- [ ] Rate limiting'i global yap (tüm ağlar için toplam 15 RPS)

**Kod Örneği:**
```typescript
class BirdeyeClient {
  private network: Network;
  
  constructor(network: Network = 'solana') {
    this.network = network;
  }
  
  private getChainHeader(): string {
    const chainMap: Record<Network, string> = {
      'solana': 'solana',
      'base': 'base',
      'bsc': 'bsc',
    };
    return chainMap[this.network];
  }
  
  private async makeRequest(url: string, params?: any) {
    const headers = {
      'X-API-KEY': BIRDEYE_API_KEY,
      'x-chain': this.getChainHeader(), // Network-aware
      'accept': 'application/json',
    };
    // ... mevcut kod
  }
}
```

### 1.3 Database Schema Güncellemesi
**Dosya:** Supabase migration script

**Yapılacaklar:**
- [ ] `pool_analyses` tablosuna `network` kolonu ekle (VARCHAR, default 'solana')
- [ ] `network` kolonu için index oluştur
- [ ] Mevcut Solana kayıtlarını `network = 'solana'` olarak güncelle

**SQL Örneği:**
```sql
ALTER TABLE pool_analyses 
ADD COLUMN network VARCHAR(10) DEFAULT 'solana' NOT NULL;

CREATE INDEX idx_pool_analyses_network ON pool_analyses(network);

UPDATE pool_analyses SET network = 'solana' WHERE network IS NULL;
```

### 1.4 Adres Validasyonu
**Dosya:** `apps/solana-liquidity-agent/src/lib/address-validator.ts` (YENİ)

**Yapılacaklar:**
- [ ] Solana adres validasyonu (Base58, 32-44 karakter)
- [ ] EVM adres validasyonu (Hex, 0x ile başlayan 42 karakter)
- [ ] Checksum validation (EVM için)
- [ ] Network detection (adres formatına göre)

**Kod Örneği:**
```typescript
import { PublicKey } from '@solana/web3.js';
import { isAddress as isEvmAddress, getAddress } from 'ethers';

export function validateAddress(address: string, network?: Network): {
  valid: boolean;
  network?: Network;
  normalized?: string;
  error?: string;
} {
  // Solana validation
  if (network === 'solana' || (!network && isSolanaAddress(address))) {
    try {
      new PublicKey(address);
      return { valid: true, network: 'solana', normalized: address };
    } catch {
      return { valid: false, error: 'Invalid Solana address' };
    }
  }
  
  // EVM validation (Base/BSC)
  if (network === 'base' || network === 'bsc' || (!network && isEvmAddress(address))) {
    if (!isEvmAddress(address)) {
      return { valid: false, error: 'Invalid EVM address' };
    }
    const checksummed = getAddress(address); // EIP-55 checksum
    return { 
      valid: true, 
      network: network || detectEvmNetwork(address), 
      normalized: checksummed.toLowerCase() // DB'de lowercase sakla
    };
  }
  
  return { valid: false, error: 'Unknown address format' };
}
```

---

## 🔧 Faz 2: EVM Transaction Parser (Hafta 1-2)

### 2.1 EVM Transaction Parser Oluşturma
**Dosya:** `apps/solana-liquidity-agent/src/lib/evm-transaction-parser.ts` (YENİ)

**Yapılacaklar:**
- [ ] Birdeye API'den gelen EVM transaction formatını parse et
- [ ] Event log parsing (Swap event detection)
- [ ] Amount calculation (18 decimals support)
- [ ] Buy/sell direction detection
- [ ] USD volume calculation

**Kod Yapısı:**
```typescript
export interface EvmSwapTransaction {
  txHash: string;
  blockUnixTime: number;
  source: string; // 'pancakeswap', 'aerodrome', etc.
  owner: string; // wallet address
  from: {
    symbol: string;
    address: string;
    amount: string; // raw amount
    uiAmount: number;
    decimals: number;
  };
  to: {
    symbol: string;
    address: string;
    amount: string;
    uiAmount: number;
    decimals: number;
  };
  side?: 'buy' | 'sell';
}

export function parseEvmSwapTransaction(
  transaction: EvmSwapTransaction,
  poolTokenAddresses?: { tokenA: string; tokenB: string }
): ParsedSwap | null {
  // Event log parsing
  // Amount calculation with decimals
  // Buy/sell detection
  // USD volume calculation
}
```

### 2.2 DEX Detection
**Dosya:** `apps/solana-liquidity-agent/src/lib/dex-detector.ts` (YENİ)

**Yapılacaklar:**
- [ ] Birdeye API'den gelen `source` field'ını kullan
- [ ] DEX name normalization (pancakeswap → PancakeSwap)
- [ ] Network-specific DEX mapping

**Kod Örneği:**
```typescript
export function normalizeDexName(source: string, network: Network): string {
  const dexMap: Record<Network, Record<string, string>> = {
    'solana': {
      'raydium': 'Raydium',
      'orca': 'Orca',
      'jupiter': 'Jupiter',
      // ...
    },
    'base': {
      'aerodrome': 'Aerodrome',
      'uniswap_v3': 'Uniswap V3',
      'baseswap': 'BaseSwap',
      // ...
    },
    'bsc': {
      'pancakeswap': 'PancakeSwap',
      'pancakeswap_v3': 'PancakeSwap V3',
      'biswap': 'Biswap',
      // ...
    },
  };
  
  return dexMap[network]?.[source.toLowerCase()] || source;
}
```

### 2.3 Worker'da Network-Aware Processing
**Dosya:** `apps/solana-liquidity-agent/src/worker.ts`

**Yapılacaklar:**
- [ ] Network parametresini job data'dan al
- [ ] Network'e göre parser seçimi (Solana vs EVM)
- [ ] Birdeye client'ı network ile initialize et

**Kod Örneği:**
```typescript
async function processAnalysis(job: Job<QueueJobData>) {
  const { poolId, tokenMint, network = 'solana', ... } = job.data;
  
  // Network-aware Birdeye client
  const birdeyeClient = new BirdeyeClient(network);
  
  // Network-aware transaction parser
  let parsedSwaps: ParsedSwap[];
  if (network === 'solana') {
    const swaps = await birdeyeClient.getSwapTransactions(poolId, limit, tokenMint);
    parsedSwaps = swaps.map(tx => parseSwapTransaction(tx, poolTokens));
  } else {
    // Base/BSC (EVM)
    const swaps = await birdeyeClient.getSwapTransactions(poolId, limit, tokenMint);
    parsedSwaps = swaps.map(tx => parseEvmSwapTransaction(tx, poolTokens));
  }
  
  // ... rest of the analysis
}
```

---

## 🔒 Faz 3: Güvenlik ve Risk Analizi (Hafta 2)

### 3.1 Token Security Endpoint Entegrasyonu
**Dosya:** `apps/solana-liquidity-agent/src/lib/token-security.ts` (YENİ)

**Yapılacaklar:**
- [ ] `/defi/token_security` endpoint'ini çağır
- [ ] EVM-specific risk alanlarını parse et:
  - `buy_tax` / `sell_tax`
  - `is_honeypot`
  - `is_proxy`
  - `transfer_pausable`
- [ ] Security score'a entegre et

**Kod Örneği:**
```typescript
export interface EvmTokenSecurity {
  buyTax?: number;
  sellTax?: number;
  isHoneypot?: boolean;
  isProxy?: boolean;
  transferPausable?: boolean;
  // ... diğer alanlar
}

export async function getEvmTokenSecurity(
  tokenAddress: string,
  network: 'base' | 'bsc'
): Promise<EvmTokenSecurity> {
  const response = await fetch(
    `${BIRDEYE_API_BASE}/defi/token_security?address=${tokenAddress}`,
    {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'x-chain': network,
      },
    }
  );
  // ... parse response
}
```

### 3.2 Security Score Güncellemesi
**Dosya:** `apps/solana-liquidity-agent/src/lib/security-scorer.ts`

**Yapılacaklar:**
- [ ] EVM-specific risk faktörlerini ekle
- [ ] Tax oranlarını security score'a dahil et
- [ ] Honeypot ve Proxy risklerini ağırlıklandır

---

## 🎨 Faz 4: Frontend Entegrasyonu (Hafta 2-3)

### 4.1 Network Selection UI
**Dosya:** `apps/web/app/deep-research/page.tsx`

**Yapılacaklar:**
- [ ] Network dropdown menü ekle (Solana/Base/BSC)
- [ ] Network seçimine göre adres validasyonu
- [ ] Network badge/indicator ekle

**UI Örneği:**
```tsx
<select 
  value={selectedNetwork} 
  onChange={(e) => setSelectedNetwork(e.target.value)}
>
  <option value="solana">Solana</option>
  <option value="base">Base</option>
  <option value="bsc">BSC</option>
</select>
```

### 4.2 Adres Validasyonu (Frontend)
**Dosya:** `apps/web/components/DeepResearchModal.tsx`

**Yapılacaklar:**
- [ ] Network seçimine göre adres format kontrolü
- [ ] Real-time validation feedback
- [ ] Hata mesajları network-aware

### 4.3 API Route Güncellemeleri
**Dosya:** `apps/web/app/api/deep-research/create/route.ts`

**Yapılacaklar:**
- [ ] Request body'ye `network` parametresi ekle
- [ ] Network validasyonu
- [ ] Worker'a network bilgisini geç

---

## 🧪 Faz 5: Test ve Optimizasyon (Hafta 3-4)

### 5.1 Birdeye API Test
**Test Senaryoları:**
- [ ] Base için test token ile API çağrısı
- [ ] BSC için test token ile API çağrısı
- [ ] Rate limiting testi (15 RPS global)
- [ ] Offset limiti testi (10,000)
- [ ] `seek_by_time` endpoint testi (gelecek için)

### 5.2 Transaction Parser Test
**Test Senaryoları:**
- [ ] Base transaction parsing
- [ ] BSC transaction parsing
- [ ] Buy/sell direction detection
- [ ] Amount calculation (18 decimals)
- [ ] DEX detection

### 5.3 End-to-End Test
**Test Senaryoları:**
- [ ] Base token analizi (gerçek token)
- [ ] BSC token analizi (gerçek token)
- [ ] Security score hesaplama
- [ ] Report generation
- [ ] Database kaydı

### 5.4 Performance Optimizasyonu
**Yapılacaklar:**
- [ ] Paralel istek yönetimi (batch'ler halinde)
- [ ] Redis caching (10-30 dakika TTL)
- [ ] Database indexing
- [ ] Rate limiting optimization

---

## 📋 Faz 6: Dokümantasyon ve Deployment (Hafta 4)

### 6.1 Kod Dokümantasyonu
- [ ] Network-aware functions için JSDoc
- [ ] EVM parser için dokümantasyon
- [ ] API endpoint'leri için dokümantasyon

### 6.2 Kullanıcı Dokümantasyonu
- [ ] Network seçimi rehberi
- [ ] Adres formatı açıklamaları
- [ ] Hata mesajları açıklamaları

### 6.3 Deployment
- [ ] Staging environment'ta test
- [ ] Production deployment
- [ ] Monitoring setup

---

## 🚨 Risk Analizi ve Mitigation

### Risk 1: Rate Limiting
**Risk:** 15 RPS global limit, 3 ağ için yetersiz olabilir  
**Mitigation:**
- Global rate limiter kullan
- Request queuing
- Caching stratejisi

### Risk 2: API Maliyetleri
**Risk:** 1.5M CU/ay limiti aşılabilir  
**Mitigation:**
- Redis caching (10-30 dakika)
- Database caching
- İleride plan yükseltme

### Risk 3: Transaction Format Farklılıkları
**Risk:** EVM ve Solana formatları çok farklı  
**Mitigation:**
- Ayrı parser'lar
- Unified interface
- Comprehensive testing

### Risk 4: Veri Tutarlılığı
**Risk:** Offset-based pagination'da data drift  
**Mitigation:**
- Deduplication (txHash bazlı)
- Redis caching
- İleride seek_by_time'a geçiş

---

## 📊 Milestone'lar

### Milestone 1: Temel Altyapı (Hafta 1 Sonu)
- ✅ Network type'ları tanımlı
- ✅ Birdeye client network-aware
- ✅ Database schema güncellendi
- ✅ Adres validasyonu çalışıyor

### Milestone 2: EVM Parser (Hafta 2 Sonu)
- ✅ EVM transaction parser çalışıyor
- ✅ DEX detection çalışıyor
- ✅ Worker network-aware processing yapıyor

### Milestone 3: Güvenlik Analizi (Hafta 2 Sonu)
- ✅ Token security endpoint entegre
- ✅ Security score EVM risklerini içeriyor

### Milestone 4: Frontend (Hafta 3 Sonu)
- ✅ Network dropdown çalışıyor
- ✅ Adres validasyonu frontend'de
- ✅ API route'ları güncellendi

### Milestone 5: Test ve Deployment (Hafta 4 Sonu)
- ✅ Tüm testler geçiyor
- ✅ Production'a deploy edildi
- ✅ Monitoring aktif

---

## 🔄 Sonraki Adımlar (BSC Entegrasyonu)

Base entegrasyonu tamamlandıktan sonra BSC entegrasyonu çok daha hızlı olacak:

1. **Network type'a 'bsc' ekle** (5 dakika)
2. **Birdeye client'a 'bsc' header desteği** (zaten var)
3. **DEX mapping'e PancakeSwap ekle** (10 dakika)
4. **Test et** (1-2 saat)

**Toplam BSC entegrasyonu:** ~1 gün

---

## 📝 Notlar

- **Rate Limiting:** Global 15 RPS, tüm ağlar için toplam
- **Caching:** Redis + Database, 10-30 dakika TTL
- **Parser:** Ayrı parser'lar (solana-parser.ts, evm-parser.ts)
- **Database:** Unified table, network kolonu ile
- **Frontend:** Dropdown menü, network badge raporda

---

## ✅ Checklist

### Hafta 1
- [ ] Types güncellemeleri
- [ ] Birdeye client network-aware
- [ ] Database migration
- [ ] Adres validasyonu

### Hafta 2
- [ ] EVM transaction parser
- [ ] DEX detection
- [ ] Token security entegrasyonu
- [ ] Worker güncellemeleri

### Hafta 3
- [ ] Frontend network selection
- [ ] API route güncellemeleri
- [ ] Adres validasyonu (frontend)
- [ ] Test senaryoları

### Hafta 4
- [ ] End-to-end testler
- [ ] Performance optimizasyonu
- [ ] Dokümantasyon
- [ ] Production deployment


