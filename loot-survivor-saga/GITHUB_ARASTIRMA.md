# 🔍 GitHub Araştırma Rehberi

## Bulmamız Gerekenler

### 1. **BibliothecaDAO GitHub Repo'ları**

Şu repo'ları kontrol et:

#### A. `BibliothecaDAO/loot-survivor-sdk`
- **URL:** https://github.com/BibliothecaDAO/loot-survivor-sdk
- **Ara:** GraphQL endpoint URL'i
- **Bakılacak yerler:**
  - `src/` klasörü
  - `config.ts` veya `constants.ts`
  - README.md
  - Environment variable örnekleri

#### B. `BibliothecaDAO/realms-contracts` veya `BibliothecaDAO/dojo`
- Torii endpoint konfigürasyonu
- Deployment isimleri

#### C. `dojoengine/dojo` (Dojo Engine resmi repo)
- Torii API dokümantasyonu
- Endpoint formatı

---

## Özellikle Bakılacak Yerler

### 1. **SDK Config Dosyaları**
```typescript
// Örnek: src/config.ts veya .env.example
GRAPHQL_URL=https://api.cartridge.gg/x/???/torii/graphql
```

### 2. **README veya Docs**
- API endpoint örnekleri
- Setup talimatları

### 3. **Example Code**
- Örnek GraphQL query'ler
- Endpoint kullanımı

---

## Bulduğunda Paylaş

1. **Doğru endpoint URL'i:**
   ```
   https://api.cartridge.gg/x/???/torii/graphql
   ```
   (??? yerine gerçek deployment adı)

2. **Deployment adı:**
   - `loot-survivor` ❌ (çalışmıyor)
   - `realms-world` ?
   - `loot-survivor-mainnet` ?
   - Başka bir şey?

3. **Query formatı:**
   - `adventurerModels` doğru mu?
   - Farklı bir query adı var mı?

4. **Environment variable:**
   - SDK'da nasıl tanımlanmış?

---

## Alternatif: Cartridge Docs

Eğer GitHub'da bulamazsan:
- Cartridge.gg dokümantasyonu
- Torii dokümantasyonu (book.dojoengine.org)








