# GitHub Push Rehberi

Bu rehber, Loot Survivor Saga projesini GitHub'a push etmek ve Loot Survivor developerlarına göstermek için adımları içerir.

## 🎯 Amaç

Projeyi Loot Survivor'ın GitHub repository'sine fork edip, kendi geliştirmelerimizi push ederek developerların incelemesine sunmak.

## 📋 Ön Hazırlık

### 1. GitHub Hesabı
- GitHub hesabınız olduğundan emin olun
- Eğer yoksa: https://github.com/signup

### 2. Loot Survivor Repository'sini Bulma
- Repository: https://github.com/Provable-Games/death-mountain
- Bu repository'yi fork edeceğiz veya kendi repository'mize push edeceğiz

## 🚀 Adım Adım İşlem

### Seçenek 1: Fork + Pull Request (Önerilen)

#### 1. Repository'yi Fork Et
```bash
# GitHub web arayüzünden:
# 1. https://github.com/Provable-Games/death-mountain adresine git
# 2. Sağ üstteki "Fork" butonuna tıkla
# 3. Fork'u kendi hesabına oluştur
```

#### 2. Fork'u Local'e Clone Et
```bash
# Kendi GitHub kullanıcı adınızla değiştirin
git clone https://github.com/KULLANICI_ADINIZ/death-mountain.git
cd death-mountain
```

#### 3. Projeyi Fork'a Kopyala
```bash
# Mevcut projenizi fork'a kopyalayın
# (Windows PowerShell)
Copy-Item -Path "C:\Users\90532\Desktop\xfroraproje\loot-survivor-saga\*" -Destination ".\" -Recurse -Force

# Veya manuel olarak dosyaları kopyalayın
```

#### 4. Git İşlemleri
```bash
# Git yapılandırması (ilk kez ise)
git config user.name "Adınız"
git config user.email "email@example.com"

# Değişiklikleri ekle
git add .

# Commit oluştur
git commit -m "feat: Add Loot Survivor Saga comic book generator prototype

- Event fetching from Torii GraphQL API
- Adventurer data decoding (felt252)
- Prototype page for testing death scenes
- Comic book generation infrastructure
- Note: Full event history requires Apibara indexer (see COST_ANALYSIS_ALL_PLAYERS.md)"

# Remote repository'yi ekle (eğer yoksa)
git remote add origin https://github.com/KULLANICI_ADINIZ/death-mountain.git

# Push et
git push -u origin main
# veya
git push -u origin master
```

#### 5. Pull Request Oluştur
```bash
# GitHub web arayüzünden:
# 1. Fork'unuzun sayfasına git
# 2. "Pull request" butonuna tıkla
# 3. Base repository: Provable-Games/death-mountain
# 4. Compare: KULLANICI_ADINIZ/death-mountain
# 5. PR başlığı: "Add Loot Survivor Saga Comic Book Generator"
# 6. PR açıklaması (aşağıdaki metni kullan):
```

**Pull Request Açıklaması:**
```markdown
## 🎨 Loot Survivor Saga - Comic Book Generator

### Özet
Bu PR, Loot Survivor oyun verilerini çizgi romana dönüştüren bir prototip içerir.

### Özellikler
- ✅ Torii GraphQL API ile event çekme
- ✅ Adventurer data decode (felt252)
- ✅ Ölüm sahnesi tespiti
- ✅ Prototip web arayüzü (`/prototype`)
- ✅ Comic book generation altyapısı

### Mevcut Durum
- **Çalışan:** Adventurer state data çekme ve decode
- **Çalışan:** Son event çekme (ls009GameEventModels - singleton pattern)
- **Limitasyon:** Tüm event history çekilemiyor (Torii events query timeout)
- **Çözüm:** Apibara indexer gerekli (maliyet analizi: COST_ANALYSIS_ALL_PLAYERS.md)

### Test
1. `npm install`
2. `npm run dev`
3. `/prototype` sayfasına git
4. Game ID gir (örn: 133595)
5. Event ve adventurer data'yı görüntüle

### Notlar
- Prototip aşamasında, tam çizgi roman üretimi için Apibara indexer kurulumu gerekiyor
- Detaylı durum raporu: FINAL_STATUS_REPORT.md
- Maliyet analizi: COST_ANALYSIS_ALL_PLAYERS.md
```

---

### Seçenek 2: Yeni Repository Oluştur (Alternatif)

Eğer fork yapmak istemiyorsanız, kendi repository'nizi oluşturabilirsiniz:

#### 1. Yeni Repository Oluştur
```bash
# GitHub web arayüzünden:
# 1. GitHub'da "New repository" butonuna tıkla
# 2. Repository adı: "loot-survivor-saga" veya "death-mountain-saga"
# 3. Public veya Private seç
# 4. "Create repository" butonuna tıkla
```

#### 2. Local Repository'yi Bağla
```bash
cd loot-survivor-saga

# Git başlat (eğer yoksa)
git init

# Remote ekle
git remote add origin https://github.com/KULLANICI_ADINIZ/loot-survivor-saga.git

# İlk commit
git add .
git commit -m "Initial commit: Loot Survivor Saga prototype"

# Push et
git branch -M main
git push -u origin main
```

#### 3. Loot Survivor Developerlarına Bildir
```markdown
# GitHub Issue veya Discussion'da:

Merhaba Loot Survivor ekibi,

Loot Survivor oyun verilerini çizgi romana dönüştüren bir prototip geliştirdim.

Repository: https://github.com/KULLANICI_ADINIZ/loot-survivor-saga

Özellikler:
- Torii GraphQL API entegrasyonu
- Event fetching ve parsing
- Adventurer data decode
- Prototip web arayüzü

Mevcut durum ve limitasyonlar için: FINAL_STATUS_REPORT.md

İncelemenizi ve geri bildirimlerinizi bekliyorum!

Teşekkürler!
```

---

## 📝 Önemli Dosyalar

Push etmeden önce kontrol edin:

1. **`.gitignore`** - Hassas bilgileri ignore et
   ```gitignore
   .env.local
   .env
   node_modules/
   .next/
   *.log
   ```

2. **`README.md`** - Proje açıklaması güncel mi?

3. **API Keys** - `.env.local` dosyasını push etmeyin!

4. **Documentation** - Şu dosyalar önemli:
   - `FINAL_STATUS_REPORT.md` - Durum raporu
   - `COST_ANALYSIS_ALL_PLAYERS.md` - Maliyet analizi
   - `APIBARA_EXPLAINED.md` - Apibara açıklaması
   - `DEEP_RESEARCH_PROMPT.md` - Deep research sonuçları

---

## 🔒 Güvenlik Kontrolü

Push etmeden önce:

```bash
# .env dosyalarını kontrol et
git status | grep .env

# Hassas bilgileri kontrol et
grep -r "API_KEY" .
grep -r "SECRET" .
grep -r "PASSWORD" .

# Eğer hassas bilgi varsa, .gitignore'a ekle
```

---

## ✅ Push Sonrası

1. **GitHub Repository'yi Kontrol Et**
   - Dosyalar doğru yüklendi mi?
   - README görünüyor mu?

2. **Developerlara Bildir**
   - GitHub Issue aç
   - Veya Discussion başlat
   - Veya direkt mesaj gönder (eğer iletişim bilgisi varsa)

3. **Bekle ve Geri Bildirim Al**
   - Developerlar inceleyecek
   - Sorular sorabilirler
   - İyileştirme önerileri gelebilir

---

## 🆘 Sorun Giderme

### "Permission denied" hatası
```bash
# SSH key ekle veya HTTPS kullan
git remote set-url origin https://github.com/KULLANICI_ADINIZ/repo.git
```

### "Large file" hatası
```bash
# Büyük dosyaları .gitignore'a ekle
# Veya Git LFS kullan
```

### "Branch protection" hatası
```bash
# Main branch korumalıysa, feature branch oluştur
git checkout -b feature/comic-generator
git push -u origin feature/comic-generator
```

---

## 📞 İletişim

Sorularınız için:
- GitHub Issues kullanın
- Loot Survivor Discord (eğer varsa)
- Twitter/X (eğer varsa)

---

**İyi şanslar! 🚀**




