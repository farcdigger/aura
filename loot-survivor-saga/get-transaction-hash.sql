-- Supabase SQL Editor'de çalıştır
-- Game ID: 133595 için transaction hash'leri bul

-- 1. Games tablosundaki raw_data'yı kontrol et
SELECT 
  id,
  raw_data->'adventurer'->>'id' as adventurer_id,
  raw_data->'logs' as logs,
  raw_data
FROM games
WHERE id = '133595';

-- 2. Eğer raw_data'da transaction hash yoksa, Torii API'den çekmen gerekecek
-- Aşağıdaki GraphQL query'yi kullan:

/*
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

Variables:
{
  "adventurerId": "133595"
}
*/

-- 3. Veya direkt Torii API'yi test et:
-- URL: https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql
-- Yukarıdaki query'yi POST request olarak gönder






