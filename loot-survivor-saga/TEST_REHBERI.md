# 🧪 TEST REHBERİ

## API Testleri İçin Gereksinimler

### **1. Health Check (`/api/health`)**
✅ **Gereksinim YOK**
- Herhangi bir parametre gerekmez
- Sadece server çalışıyor mu kontrol eder

### **2. Games List API (`/api/games/list?wallet=...`)**
✅ **Herhangi bir Starknet cüzdan adresi yeterli**

**Açıklama:**
- Bibliotheca GraphQL API **public** bir API
- Herhangi bir cüzdan adresi ile sorgu yapabilirsiniz
- Eğer o cüzdan **oyun oynamışsa** → Oyunlar listelenir
- Eğer o cüzdan **oyun oynamamışsa** → Boş liste döner (hata değil)

**Test Senaryoları:**

#### **Senaryo A: Herhangi bir cüzdan adresi (Format testi)**
```bash
curl "http://localhost:3000/api/games/list?wallet=0x1234567890abcdef1234567890abcdef12345678"
```
**Sonuç:** Boş liste döner ama API çalışıyor demektir ✅

#### **Senaryo B: Gerçek oyun oynamış cüzdan (Data testi)**
```bash
# Loot Survivor oyunu oynamış bir cüzdan adresi bul
curl "http://localhost:3000/api/games/list?wallet=0x..."
```
**Sonuç:** Oyunlar listelenir ✅

#### **Senaryo C: Test için mock data (Geliştirme)**
- Şimdilik boş liste dönerse de sorun yok
- API endpoint'inin çalıştığını gösterir

### **3. Game Detail API (`/api/games/[gameId]`)**
⚠️ **Gerçek Game ID gerekli**

**Açıklama:**
- Bu endpoint **gerçek bir Game ID** ister
- Game ID bulmak için:
  1. Loot Survivor oyununu oyna → Game ID al
  2. Veya Bibliotheca GraphQL Playground'dan bir Game ID bul
  3. Veya test için şimdilik atla (Hafta 2'de test ederiz)

---

## 🎯 Şu An İçin Test Stratejisi

### **Kolay Test (Şimdi yapabilirsin):**

1. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   ```
   ✅ Başarılı olmalı

2. **Games List (Herhangi bir cüzdan ile):**
   ```bash
   curl "http://localhost:3000/api/games/list?wallet=0x1234567890abcdef1234567890abcdef12345678"
   ```
   ✅ Boş liste döner ama API çalışıyor (hata yok)

### **Tam Test (İleride):**

- Gerçek oyun oynamış cüzdan bul
- Gerçek Game ID bul
- Tam akışı test et

---

## 💡 Öneri

**Şu an için:**
- Health check test et ✅
- Games list'i herhangi bir cüzdan ile test et (boş liste normal) ✅
- Game detail'i şimdilik atla (gerçek Game ID gerekiyor)

**Hafta 2'de:**
- Gerçek Game ID ile test ederiz
- AI entegrasyonu test ederiz

---

## 🔍 Gerçek Cüzdan/Game ID Nasıl Bulunur?

### **Yöntem 1: Loot Survivor Oyunu Oyna**
1. https://survivor.realms.world → Oyunu oyna
2. Cüzdanını bağla
3. Oyun bitince Game ID'yi al

### **Yöntem 2: Bibliotheca GraphQL Playground**
1. https://api.bibliothecadao.xyz/graphql
2. Şu query'yi çalıştır:
```graphql
query {
  adventurers(first: 10) {
    id
    owner
    name
    level
  }
}
```
3. Bir Game ID ve wallet address al

### **Yöntem 3: Test için şimdilik atla**
- Hafta 2'de AI entegrasyonu yaparken gerçek data ile test ederiz






