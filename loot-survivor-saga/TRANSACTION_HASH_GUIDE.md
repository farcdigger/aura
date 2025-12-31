# Transaction Hash Bulma Rehberi

## Mevcut Durum

Şu an kodda transaction hash'leri **çekilmiyor**. Torii API'de `battles` ve `discoveries` query'lerinde `txHash` field'ı var ama kullanılmıyor.

## Transaction Hash'i Bulma Yöntemleri

### 1. Torii GraphQL API (Önerilen)

**URL:** `https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql`

**Query:**
```graphql
query GetGameTransactions($adventurerId: String!) {
  battles(
    where: { adventurerId: $adventurerId }
    orderBy: { direction: DESC, field: TIMESTAMP }
    first: 10
  ) {
    edges {
      node {
        id
        txHash
        timestamp
        damage
        beastId
      }
    }
  }
  
  discoveries(
    where: { adventurerId: $adventurerId }
    orderBy: { direction: DESC, field: TIMESTAMP }
    first: 10
  ) {
    edges {
      node {
        id
        txHash
        timestamp
        discoveryType
      }
    }
  }
}
```

**Variables:**
```json
{
  "adventurerId": "133595"
}
```

### 2. Supabase'den Kontrol Et

Supabase'de `games` tablosundaki `raw_data` JSONB field'ında transaction hash olabilir:

```sql
SELECT 
  id,
  raw_data->'logs' as logs,
  raw_data
FROM games
WHERE id = '133595';
```

### 3. Starknet Explorer

Game ID'yi Starknet Explorer'da arayarak transaction hash'leri bulabilirsin:
- https://starkscan.co/
- https://voyager.online/

## Felt252 Decode için Transaction Hash Kullanımı

Transaction hash'i kullanarak:
1. Starknet RPC'den transaction details çek
2. Transaction'daki event'leri parse et
3. Event data'dan felt252 değerlerini çıkar
4. Packed data'yı decode et

## Hızlı Test

Postman veya curl ile:

```bash
curl -X POST https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetBattles($id: String!) { battles(where: { adventurerId: $id }, first: 1) { edges { node { txHash timestamp } } } }",
    "variables": { "id": "133595" }
  }'
```






