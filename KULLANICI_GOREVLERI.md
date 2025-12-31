# ✅ KULLANICI GÖREVLERİ - LOOT SURVIVOR SAGA

> **ÖNEMLİ:** Bu görevleri tamamlamadan geliştirmeye başlayamayız!

---

## 🔑 1. API KEY'LERİ VE HESAPLAR (30-45 dakika)

### **A. OpenAI (Zorunlu)**
- [ ] https://platform.openai.com → Hesap oluştur
- [ ] Billing → Add payment method ($5 minimum)
- [ ] API Keys → Create new secret key
- [ ] **API Key'i kopyala:** `sk-proj-...`
- [ ] **Not:** GPT-4o kullanacağız (Pay-per-use, ~$0.03/story)

### **B. Replicate (Zorunlu)**
- [ ] https://replicate.com → Sign up (GitHub ile kolay)
- [ ] Account → API Tokens → Create token
- [ ] **Token'ı kopyala:** `r8_...`
- [ ] **Not:** $5 free credit var, sonra $0.003/image

### **C. Supabase (Zorunlu)**
- [ ] https://supabase.com → Sign up
- [ ] New Project → Name: `loot-survivor-saga`
- [ ] Database Password: **Güçlü şifre oluştur ve kaydet!**
- [ ] Region: En yakın (Europe West önerilir)
- [ ] Settings → API → **URL ve anon key'i kopyala**

### **D. Upstash (Zorunlu)**
- [ ] https://upstash.com → Sign up
- [ ] Create Database → Redis
- [ ] Region: En yakın
- [ ] **REST URL ve Token'ı kopyala**

### **E. Cloudflare (Zorunlu - Storage için)**
- [ ] https://cloudflare.com → Sign up
- [ ] R2 → Create bucket → Name: `loot-survivor-sagas`
- [ ] API Tokens → Create token (R2:Edit permissions)
- [ ] **Account ID, Access Key ID, Secret Access Key'i kopyala**

### **F. Vercel (Opsiyonel - Şimdilik local dev)**
- [ ] https://vercel.com → Sign up (GitHub ile)
- [ ] **Not:** Deployment için gerekli, şimdilik local çalışabiliriz

---

## 💻 2. GELİŞTİRME ORTAMI (15 dakika)

### **A. Node.js Kontrolü**
```bash
# Terminal'de çalıştır:
node --version  # v20.x.x olmalı
npm --version   # 10.x.x olmalı

# Eğer yoksa:
# Windows: https://nodejs.org → LTS indir
# Mac: brew install node@20
# Linux: nvm install 20
```

### **B. Git Kontrolü**
```bash
git --version  # 2.x.x olmalı

# Eğer yoksa:
# Windows: https://git-scm.com/download/win
# Mac: brew install git
```

### **C. Code Editor**
- [ ] VS Code yüklü mü? (Veya Cursor)
- [ ] TypeScript extension yüklü mü?

---

## 📁 3. PROJE KLASÖRÜ (2 dakika)

```bash
# Desktop'ta veya istediğin yerde:
cd Desktop  # veya başka bir yer
mkdir loot-survivor-saga
cd loot-survivor-saga

# Bu klasör projenin root'u olacak
```

---

## 📝 4. ENVIRONMENT VARIABLES HAZIRLAMA

Aşağıdaki bilgileri bir yere kaydet (`.env.local` dosyası oluşturacağız):

```
OPENAI_API_KEY=sk-proj-...
REPLICATE_API_TOKEN=r8_...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
UPSTASH_REDIS_URL=redis://xxxxx.upstash.io:6379
UPSTASH_REDIS_TOKEN=AXxxxxx...
R2_ACCOUNT_ID=xxxxx
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_BUCKET_NAME=loot-survivor-sagas
```

---

## ✅ TAMAMLANDI MI?

Tüm checkbox'ları işaretledikten sonra bana şunu söyle:
> "Hazırım, API key'ler elimde, proje klasörü hazır"

O zaman geliştirmeye başlayacağız! 🚀

---

## ⚠️ ÖNEMLİ NOTLAR

1. **API Key'leri ASLA GitHub'a commit etme!** (`.gitignore`'a eklenecek)
2. **Supabase şifresini kaydet!** (Unutursan reset gerekir)
3. **Replicate free credit'i dikkatli kullan** (Test için yeterli)
4. **OpenAI billing limit koy** (Örn: $20/month max)

---

## 🆘 YARDIM GEREKİRSE

Herhangi bir adımda takılırsan, sor:
- "OpenAI'da API key nerede?"
- "Supabase'de hangi key'i almalıyım?"
- "Replicate token bulamıyorum"

Hemen yardımcı olurum! 😊






