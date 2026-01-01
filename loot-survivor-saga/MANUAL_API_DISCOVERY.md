# 🔍 Manuel API Keşif Rehberi

## Adım 1: Oyun Sitesinde Network Tab Kontrolü

1. **Oyun sitesini aç:** https://survivor.realms.world/ veya https://lootsurvivor.io/

2. **F12 tuşuna bas** (Developer Tools)

3. **Network sekmesine git**

4. **Bir oyun detayına tıkla** (örneğin leaderboard'dan bir oyuncuya tıkla)

5. **Network tab'ında şunları ara:**
   - `/graphql` içeren istekler
   - `api.cartridge.gg` içeren istekler
   - `torii` içeren istekler
   - `bibliotheca` içeren istekler

6. **İsteği bulduğunda:**
   - **Request URL'i kopyala** (tam URL)
   - **Headers sekmesine bak** (Authorization var mı?)
   - **Payload sekmesine bak** (GraphQL query'yi gör)

---

## Adım 2: Alternatif Yöntemler

### A. Browser Console'da JavaScript Kodu

Oyun sitesinde Console'a şunu yaz:

```javascript
// Tüm fetch/axios isteklerini yakala
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch URL:', args[0]);
  return originalFetch.apply(this, args);
};

// Veya network isteklerini logla
performance.getEntriesByType('resource').forEach(entry => {
  if (entry.name.includes('graphql') || entry.name.includes('api')) {
    console.log('API Request:', entry.name);
  }
});
```

### B. Source Code İnceleme

1. **Sources sekmesine git** (F12 → Sources)
2. **JavaScript dosyalarını ara:**
   - `graphql` içeren dosyalar
   - `api` içeren dosyalar
   - `config` veya `constants` dosyaları

---

## Adım 3: GitHub Repo Kontrolü

### BibliothecaDAO/loot-survivor-sdk

1. **Repo'ya git:** https://github.com/BibliothecaDAO/loot-survivor-sdk
2. **Ara:**
   - `src/` klasöründe config dosyaları
   - `.env.example` veya `env.example`
   - README.md'de endpoint örnekleri
   - `package.json` içinde script'ler

### Örnek Arama:
```bash
# Repo'da şunları ara:
- "cartridge.gg"
- "torii"
- "graphql"
- "endpoint"
- "API_URL"
```

---

## Adım 4: Alternatif API Yöntemleri

Eğer GraphQL bulunamazsa, belki:

1. **Direkt Starknet RPC kullanılıyor**
   - Contract'ı direkt okuyabiliriz
   - RPC: `https://starknet-mainnet.public.blastapi.io`

2. **Farklı bir indexer**
   - Apibara stream
   - The Graph (ama Starknet'te yok)
   - Özel bir API

---

## Bulduğunda Paylaş

1. **Tam API URL'i:**
   ```
   https://...
   ```

2. **Query formatı:**
   ```graphql
   query { ... }
   ```

3. **Headers (varsa):**
   ```
   Authorization: ...
   ```

4. **Deployment adı (URL'den):**
   ```
   /x/[DEPLOYMENT_NAME]/...
   ```








