# Multi-Chain Entegrasyonu (Base + BSC) - Kritik Sorular

## 📋 Yol Haritası Oluşturmak İçin Gerekli Bilgiler

### 1. Birdeye API Planı ve Limitler
**Soru 1.1:** Şu anda hangi Birdeye API planını kullanıyorsunuz?
- [ ] Free (30K CU/ay)
- [ ] Starter ($99/ay, 3M CU/ay)
- [ ] Premium (50 RPS)
- [ ] Business (100 RPS)

**Soru 1.2:** Base ve BSC için aynı API key kullanılacak mı?
- [ ] Evet, aynı key
- [ ] Hayır, ayrı key'ler

**Soru 1.3:** Rate limit'ler her ağ için ayrı mı, toplam mı?
- [ ] Her ağ için ayrı (ör: Solana 15 RPS, Base 15 RPS, BSC 15 RPS)
- [ ] Toplam limit (ör: Tüm ağlar için toplam 15 RPS)

**Soru 1.4:** Plan yükseltmesi planlanıyor mu?
- [ ] Hayır, mevcut planla devam
- [ ] Evet, Premium/Business'a geçilecek
- [ ] Henüz karar verilmedi

### 2. Öncelik ve Timeline
**Soru 2.1:** Hangi ağ önce eklenecek?
- [ ] Base önce, sonra BSC
- [ ] BSC önce, sonra Base
- [ ] İkisi paralel eklenecek

**Soru 2.2:** Hedef timeline nedir?
- [ ] 1-2 hafta içinde MVP
- [ ] 1 ay içinde production-ready
- [ ] 2-3 ay içinde tam entegrasyon
- [ ] Henüz belirlenmedi

**Soru 2.3:** MVP için hangi özellikler kritik?
- [ ] Sadece veri çekme (10,000 swap)
- [ ] Veri çekme + temel analiz
- [ ] Veri çekme + analiz + güvenlik skoru
- [ ] Tam özellik seti (Solana ile aynı)

### 3. Frontend ve Kullanıcı Deneyimi
**Soru 3.1:** Network seçimi nasıl yapılacak?
- [ ] Dropdown menü (Solana/Base/BSC seçimi)
- [ ] Otomatik algılama (adres formatına göre)
- [ ] Her iki yöntem de (dropdown + otomatik)

**Soru 3.2:** UI'da network gösterimi nasıl olacak?
- [ ] Badge/etiket (her analizde network gösterilecek)
- [ ] Ayrı sayfalar (solana.deepresearch.com, base.deepresearch.com)
- [ ] Filtreleme (kullanıcı network'e göre filtreleyebilecek)
- [ ] Sadece analiz sonuçlarında gösterilecek

**Soru 3.3:** Adres validasyonu nasıl yapılacak?
- [ ] Frontend'de validasyon (network'e göre format kontrolü)
- [ ] Backend'de validasyon (API'ye gönderilmeden önce)
- [ ] Her ikisi de

### 4. Database ve Veri Yönetimi
**Soru 4.1:** Mevcut Supabase şeması değiştirilebilir mi?
- [ ] Evet, migration yapılabilir
- [ ] Hayır, mevcut şema korunmalı
- [ ] Kısmen (yeni kolonlar eklenebilir)

**Soru 4.2:** Network bilgisi nasıl saklanacak?
- [ ] Her analiz kaydında `network` kolonu
- [ ] Ayrı tablolar (solana_analyses, base_analyses, bsc_analyses)
- [ ] JSON field içinde metadata olarak

**Soru 4.3:** Solana analizleri ile Base/BSC analizleri aynı tabloda mı?
- [ ] Evet, unified table
- [ ] Hayır, ayrı tablolar
- [ ] Henüz karar verilmedi

**Soru 4.4:** Adres formatları için database değişikliği yapılabilir mi?
- [ ] Evet, VARCHAR genişletilebilir
- [ ] Hayır, mevcut format korunmalı
- [ ] Normalizasyon katmanı ile çözülecek

### 5. Transaction Parser ve DEX Detection
**Soru 5.1:** Transaction parser yaklaşımı?
- [ ] Unified parser (network'e göre branch)
- [ ] Ayrı parser'lar (solana-parser.ts, base-parser.ts, bsc-parser.ts)
- [ ] Plugin architecture (network-specific plugins)

**Soru 5.2:** DEX detection nasıl yapılacak?
- [ ] Hardcoded listeler (her network için ayrı)
- [ ] Birdeye API'den source field'ı kullanılacak
- [ ] Her ikisi de (fallback mekanizması)

**Soru 5.3:** Base ve BSC için hangi DEX'ler öncelikli?
- [ ] Base: Aerodrome, Uniswap V3
- [ ] BSC: PancakeSwap, Biswap
- [ ] Tüm DEX'ler desteklenecek

### 6. Veri Çekme Stratejisi
**Soru 6.1:** Offset vs seek_by_time?
- [ ] Offset-based (mevcut yöntem, 10K limit)
- [ ] seek_by_time (sınırsız, daha karmaşık)
- [ ] Her ikisi de (network'e göre seçim)

**Soru 6.2:** Paralel istek yönetimi?
- [ ] Seri istekler (sırayla)
- [ ] Paralel istekler (batch'ler halinde)
- [ ] Adaptive (rate limit'e göre)

**Soru 6.3:** Caching stratejisi?
- [ ] Redis caching (10-30 dakika TTL)
- [ ] Database caching (daha uzun süre)
- [ ] Her ikisi de

### 7. Güvenlik ve Risk Analizi
**Soru 7.1:** Base/BSC için güvenlik analizi?
- [ ] Sadece token_security endpoint'i
- [ ] Token_security + custom risk analizi
- [ ] Solana ile aynı risk analizi + EVM-specific eklemeler

**Soru 7.2:** Tax token tespiti?
- [ ] Birdeye API'den buy_tax/sell_tax kullanılacak
- [ ] Custom hesaplama yapılacak
- [ ] Her ikisi de

**Soru 7.3:** Honeypot tespiti?
- [ ] Birdeye API'den is_honeypot kullanılacak
- [ ] Custom detection algoritması
- [ ] Her ikisi de

### 8. Test ve Deployment
**Soru 8.1:** Test stratejisi?
- [ ] Testnet'te test
- [ ] Mainnet'te gerçek token'larla test
- [ ] Her ikisi de

**Soru 8.2:** Test için hangi token'lar kullanılacak?
- [ ] Base: [token adresleri]
- [ ] BSC: [token adresleri]
- [ ] Henüz belirlenmedi

**Soru 8.3:** Deployment stratejisi?
- [ ] Aynı servis (network parametresi ile)
- [ ] Ayrı servisler (base-agent, bsc-agent)
- [ ] Feature flag ile gradual rollout

### 9. Özellik Eşitliği
**Soru 9.1:** Oyunlar (Speed Click, Frog Jump) her iki ağ için de geçerli mi?
- [ ] Evet, aynı oyunlar
- [ ] Hayır, sadece Solana için
- [ ] Network-specific oyunlar

**Soru 9.2:** NFT sahipleri için indirim her iki ağ için de geçerli mi?
- [ ] Evet, cross-chain NFT ownership
- [ ] Hayır, sadece Solana NFT'leri
- [ ] Her ağ için ayrı NFT collection'ları

**Soru 9.3:** Fiyatlandırma?
- [ ] Aynı fiyat (tüm ağlar için)
- [ ] Network'e göre farklı fiyat
- [ ] Henüz belirlenmedi

### 10. Performans ve Ölçeklenebilirlik
**Soru 10.1:** Worker concurrency?
- [ ] Mevcut (4 concurrent job)
- [ ] Artırılacak (network sayısına göre)
- [ ] Network-specific worker'lar

**Soru 10.2:** Queue yönetimi?
- [ ] Unified queue (tüm ağlar için)
- [ ] Ayrı queue'lar (solana-queue, base-queue, bsc-queue)
- [ ] Priority queue (network'e göre öncelik)

**Soru 10.3:** Rate limiting?
- [ ] Global rate limit
- [ ] Network-specific rate limit
- [ ] Adaptive rate limiting

### 11. Monitoring ve Logging
**Soru 11.1:** Logging stratejisi?
- [ ] Network bilgisi her log'da
- [ ] Ayrı log dosyaları
- [ ] Structured logging (network field ile)

**Soru 11.2:** Monitoring?
- [ ] Network-specific metrics
- [ ] Unified metrics
- [ ] Her ikisi de

### 12. Dokümantasyon ve Kullanıcı Eğitimi
**Soru 12.1:** Kullanıcı dokümantasyonu?
- [ ] Network-specific guide'lar
- [ ] Unified guide (tüm ağlar için)
- [ ] Her ikisi de

**Soru 12.2:** Hata mesajları?
- [ ] Network-specific hata mesajları
- [ ] Unified hata mesajları
- [ ] Context-aware mesajlar

---

## 📝 Notlar

Bu soruları yanıtladıktan sonra, detaylı bir yol haritası oluşturulacak:
1. Mimari tasarım
2. Implementation planı
3. Test stratejisi
4. Deployment planı
5. Risk analizi ve mitigation


