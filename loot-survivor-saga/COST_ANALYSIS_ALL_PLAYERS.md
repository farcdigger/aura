# Maliyet Analizi - Tüm Oyuncular İçin Apibara Indexer

## 📊 Senaryo: Tüm Loot Survivor Oyuncularının Event'lerini Çekmek

### Varsayımlar (Gerçekçi Tahminler)

#### Oyun Ölçeği
- **Toplam Adventurer Sayısı**: ~10,000-50,000 (tahmin)
- **Aktif Oyunlar**: ~5,000-20,000
- **Ortalama Event/Oyun**: 200-500 event
- **Günlük Yeni Event**: ~50,000-200,000 event/gün

#### Veri Boyutu
- **Her Event**: ~1-2 KB (JSON formatında)
- **Oyun Başına**: ~200-1000 KB (200-500 event × 2 KB)
- **Toplam Storage (1 ay)**: ~15-60 GB
- **Toplam Storage (1 yıl)**: ~180-720 GB

---

## 💰 Maliyet Tablosu

### Senaryo 1: Küçük Ölçek (5,000 aktif oyun)

| Kalem | Detay | Aylık Maliyet | Yıllık Maliyet |
|-------|-------|---------------|----------------|
| **VPS (Apibara Indexer)** | 4 CPU, 8GB RAM, 100GB SSD | $40-60 | $480-720 |
| **MongoDB Atlas** | M10 Cluster (10GB storage) | $57 | $684 |
| **Bandwidth** | Blockchain'den veri çekme | $10-20 | $120-240 |
| **Backup Storage** | S3/Cloud Storage (yedek) | $5-10 | $60-120 |
| **Monitoring** | Uptime monitoring | $5 | $60 |
| **TOPLAM** | | **$117-152/ay** | **$1,404-1,824/yıl** |

---

### Senaryo 2: Orta Ölçek (20,000 aktif oyun)

| Kalem | Detay | Aylık Maliyet | Yıllık Maliyet |
|-------|-------|---------------|----------------|
| **VPS (Apibara Indexer)** | 8 CPU, 16GB RAM, 200GB SSD | $80-120 | $960-1,440 |
| **MongoDB Atlas** | M30 Cluster (50GB storage) | $200 | $2,400 |
| **Bandwidth** | Blockchain'den veri çekme | $30-50 | $360-600 |
| **Backup Storage** | S3/Cloud Storage (yedek) | $15-25 | $180-300 |
| **Monitoring** | Uptime monitoring | $10 | $120 |
| **TOPLAM** | | **$335-405/ay** | **$4,020-4,860/yıl** |

---

### Senaryo 3: Büyük Ölçek (50,000+ aktif oyun)

| Kalem | Detay | Aylık Maliyet | Yıllık Maliyet |
|-------|-------|---------------|----------------|
| **VPS (Apibara Indexer)** | 16 CPU, 32GB RAM, 500GB SSD | $200-300 | $2,400-3,600 |
| **MongoDB Atlas** | M50 Cluster (200GB storage) | $500-700 | $6,000-8,400 |
| **Bandwidth** | Blockchain'den veri çekme | $50-100 | $600-1,200 |
| **Backup Storage** | S3/Cloud Storage (yedek) | $30-50 | $360-600 |
| **Monitoring** | Uptime monitoring | $20 | $240 |
| **TOPLAM** | | **$800-1,170/ay** | **$9,600-14,040/yıl** |

---

## 📈 Ölçeklenebilirlik Analizi

### Storage Büyümesi (1 Yıl)

| Ay | Event Sayısı | Storage (GB) | MongoDB Maliyeti |
|----|--------------|--------------|-------------------|
| 1 | ~1.5M | 15-30 | $57-200 |
| 3 | ~4.5M | 45-90 | $200-500 |
| 6 | ~9M | 90-180 | $500-700 |
| 12 | ~18M | 180-360 | $700-1,000 |

**Not**: Storage büyüdükçe MongoDB maliyeti artar.

---

## 💡 Maliyet Optimizasyonu Stratejileri

### 1. Seçici Indexing (Önerilen)
**Yaklaşım**: Sadece aktif oyunların event'lerini çek
- **Tasarruf**: %50-70 storage azalması
- **Maliyet**: Senaryo 1 → Senaryo 2 arası

### 2. Arşivleme
**Yaklaşım**: 6+ ay eski event'leri cold storage'a taşı
- **Tasarruf**: %30-50 storage azalması
- **Maliyet**: S3 Glacier → $0.004/GB/ay

### 3. Compression
**Yaklaşım**: Event'leri sıkıştır (gzip)
- **Tasarruf**: %60-70 storage azalması
- **Maliyet**: CPU artışı (minimal)

### 4. Hybrid Approach
**Yaklaşım**: 
- Son 3 ay: MongoDB (hızlı erişim)
- 3-12 ay: S3 (soğuk depolama)
- 12+ ay: Arşivle (nadiren erişilir)

**Tasarruf**: %40-60 toplam maliyet

---

## 🎯 Önerilen Yaklaşım

### Başlangıç (İlk 3 Ay)
- **Senaryo 1**: Küçük ölçek ($117-152/ay)
- **Strateji**: Tüm event'leri çek, sonra optimize et
- **Toplam**: ~$350-450 (3 ay)

### Büyüme (3-12 Ay)
- **Senaryo 2**: Orta ölçek ($335-405/ay)
- **Strateji**: Arşivleme + compression
- **Toplam**: ~$2,000-3,000 (9 ay)

### Ölçeklenme (12+ Ay)
- **Senaryo 3**: Büyük ölçek ($800-1,170/ay)
- **Strateji**: Hybrid approach + seçici indexing
- **Toplam**: ~$9,600-14,040/yıl

---

## 📊 Karşılaştırma: Torii vs Apibara

| Özellik | Torii (Şu An) | Apibara (Tüm Oyuncular) |
|---------|---------------|-------------------------|
| **Maliyet** | ✅ Ücretsiz | ❌ $117-1,170/ay |
| **Hız** | ❌ Timeout | ✅ <1s |
| **Event History** | ❌ Çekemiyoruz | ✅ Tüm event'ler |
| **Kontrol** | ❌ Yok | ✅ Tam kontrol |
| **Ölçeklenebilirlik** | ❌ Limitli | ✅ Sınırsız |
| **Setup** | ✅ Hazır | ❌ 2-3 gün |

---

## 🔍 Detaylı Maliyet Açıklamaları

### 1. VPS (Apibara Indexer)
**Neden Gerekli?**
- Apibara indexer sürekli çalışmalı (7/24)
- Blockchain'den event'leri dinlemeli
- CPU ve RAM yoğun işlem

**Seçenekler:**
- **DigitalOcean**: $40-200/ay
- **AWS EC2**: $50-300/ay
- **Hetzner**: $30-150/ay (daha ucuz)

**Öneri**: DigitalOcean veya Hetzner (daha ucuz)

---

### 2. MongoDB Atlas
**Neden Gerekli?**
- Tüm event'leri saklamak için
- Hızlı sorgular (indexed)
- Ölçeklenebilir

**Seçenekler:**
- **MongoDB Atlas**: $57-700/ay (managed)
- **Self-hosted MongoDB**: $20-100/ay (VPS'te)

**Öneri**: Başlangıçta MongoDB Atlas, büyüdükçe self-hosted

---

### 3. Bandwidth
**Neden Gerekli?**
- Blockchain'den veri çekme
- RPC calls
- Event streaming

**Tahmin**: $10-100/ay (oyuncu sayısına göre)

---

### 4. Backup Storage
**Neden Gerekli?**
- Veri kaybını önlemek
- Disaster recovery
- Compliance

**Seçenekler:**
- **AWS S3**: $0.023/GB/ay
- **Backblaze B2**: $0.005/GB/ay (daha ucuz)

**Öneri**: Backblaze B2 (daha ucuz)

---

## 💰 Toplam Maliyet Özeti

### Minimum (Küçük Ölçek)
- **Aylık**: $117-152
- **Yıllık**: $1,404-1,824
- **İlk Yıl**: ~$1,500-2,000

### Orta (Orta Ölçek)
- **Aylık**: $335-405
- **Yıllık**: $4,020-4,860
- **İlk Yıl**: ~$4,000-5,000

### Maksimum (Büyük Ölçek)
- **Aylık**: $800-1,170
- **Yıllık**: $9,600-14,040
- **İlk Yıl**: ~$10,000-15,000

---

## 🎯 Sonuç ve Öneriler

### Başlangıç İçin
1. **Küçük ölçekle başla** ($117-152/ay)
2. **Tüm event'leri çek** (veri topla)
3. **3 ay sonra optimize et** (arşivleme, compression)

### Büyüme İçin
1. **Orta ölçeğe geç** ($335-405/ay)
2. **Hybrid approach kullan** (hot/cold storage)
3. **Seçici indexing** (sadece aktif oyunlar)

### Ölçeklenme İçin
1. **Büyük ölçeğe geç** ($800-1,170/ay)
2. **Self-hosted MongoDB** (maliyet tasarrufu)
3. **Multi-region** (performans)

---

## ⚠️ Dikkat Edilmesi Gerekenler

1. **Storage büyümesi**: 1 yılda 180-720 GB
2. **Bandwidth limitleri**: RPC provider limitleri
3. **MongoDB query limitleri**: Atlas'ta sorgu limitleri var
4. **Backup maliyeti**: Yedekleme de maliyet getirir
5. **Monitoring**: Sistem sağlığı için gerekli

---

## ✅ Önerilen Plan

### Faz 1: MVP (İlk 3 Ay)
- **Maliyet**: $117-152/ay
- **Hedef**: Tüm event'leri çek, sistem kur
- **Toplam**: ~$350-450

### Faz 2: Optimizasyon (3-6 Ay)
- **Maliyet**: $200-300/ay
- **Hedef**: Arşivleme, compression
- **Toplam**: ~$600-900

### Faz 3: Ölçeklenme (6-12 Ay)
- **Maliyet**: $400-600/ay
- **Hedef**: Hybrid approach, seçici indexing
- **Toplam**: ~$2,400-3,600

**İlk Yıl Toplam**: ~$3,350-4,950

---

## 📝 Sonuç

**Tüm oyuncular için Apibara indexer:**
- **Minimum**: $117-152/ay (~$1,500/yıl)
- **Orta**: $335-405/ay (~$4,000/yıl)
- **Maksimum**: $800-1,170/ay (~$10,000/yıl)

**Öneri**: Küçük ölçekle başla, büyüdükçe ölçeklendir.



