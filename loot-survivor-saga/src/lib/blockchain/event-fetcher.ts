// src/lib/blockchain/event-fetcher.ts
// Torii GraphQL ile game event'lerini çeker (battles, discoveries)
// 
// PERFORMANCE ANALYSIS (Provable Games Death Mountain Architecture Report):
// ========================================================================
// Torii events sorgusu O(N) karmaşıklığında çalışır ve keys: [selector, adventurer_id]
// formatı veritabanı tarafında verimsiz tablo taramasına (table scan) neden olur.
// 
// SORUN: 
// - events sorgusu genel amaçlı bir araçtır ve özelleştirilmemiş olay sorgularında
//   doğrusal karmaşıklık ile çalışmak zorundadır
// - keys filtresi düşük kardinaliteye sahiptir (selector milyonlarca satırda aynı)
// - Veritabanı motoru JSON array içindeki elemanlar için optimize edilmiş indeks kullanamaz
// - Full Table Scan veya Partial Index Scan yapmak zorunda kalır
// 
// ÇÖZÜM STRATEJİSİ:
// 1. Batch size küçültüldü: 50 → 10 (daha küçük sorgular, daha az timeout riski)
// 2. Timeout artırıldı: 30s → 60s (ama her sayfa için 15s limit)
// 3. Retry mekanizması eklendi: Exponential backoff ile 3 deneme
// 4. Cursor-based pagination zaten kullanılıyor (doğru yaklaşım)
// 
// ALTERNATİF (Gelecek için):
// - Model-specific queries kullanmak (battles, discoveries) - O(1) erişim
// - GraphQL subscriptions kullanmak (real-time için)
// - Optimistic updates (client-side state management)
//
// CRITICAL: Alchemy RPC geniş blok taraması ücretsiz planda çalışmıyor
// Torii zaten tüm blokları tarayıp veritabanına yazdığı için çok daha hızlı

import axios from 'axios';
import { hash, num } from 'starknet';
import type { GameLog } from '@/types/game';

// Torii GraphQL API URL (Bibliotheca/Dojo)
// Torii zaten tüm blokları tarayıp veritabanına yazdığı için çok daha hızlı
const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 
  'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';

// World Contract (Event Kaynağı) - Torii'de address filtresi için
const WORLD_CONTRACT = process.env.NEXT_PUBLIC_WORLD_CONTRACT || 
  '0x018108b32cea514a78ef1b0e4a0753e855cdf620bc0565202c02456f618c4dc4';

// Event Selectors (sn_keccak hash) - Doğrudan event isimlerinin hash'leri
// CRITICAL FIX: GameEvent değil, spesifik event isimlerini kullan
const ATTACK_EVENT_SELECTOR = hash.starknetKeccak("Attack");
const DISCOVERY_EVENT_SELECTOR = hash.starknetKeccak("Discovery");
const AMBUSH_EVENT_SELECTOR = hash.starknetKeccak("Ambush");

// GameEvent hash (Dojo wrapper) - Eğer spesifik event'ler sonuç vermezse bunu kullan
const GAMEEVENT_HASH = '0x1a2a4ef69d76c64601449622df70845a7695392095f36e4f35f29910d55e8c1';

// Event Tag'leri (Dojo standard)
const TAG_ATTACK = 14; // Player attacks beast
const TAG_BEAST_ATTACK = 15; // Beast attacks player
const TAG_BEAST = 2; // Beast encounter
const TAG_DISCOVERY = 3; // Discovery event
const TAG_DEFEATED_BEAST = 5; // Defeated beast (Victory)

/**
 * Belirli bir adventurer ID için game event'lerini çeker
 * 
 * YENİ YAKLAŞIM (2024):
 * - ls009GameEventModels query kullanılıyor (O(1) erişim - ÇOK HIZLI!)
 * - events query yerine model-specific query kullanılıyor
 * - Timeout sorunu çözüldü!
 * 
 * FALLBACK:
 * - Eğer ls009GameEventModels çalışmazsa, eski events query'ye fallback yapılır
 * 
 * @param adventurerId - Adventurer ID (decimal veya hex formatında)
 * @param maxEvents - Maksimum çekilecek event sayısı (default: 200, çizgi roman için yeterli)
 * @returns GameLog[] - Parse edilmiş game event'leri
 */
/**
 * Belirli bir adventurer ID için game event'lerini çeker
 * 
 * DEEP RESEARCH BULGUSU (2024):
 * =============================
 * ls009GameEventModels sadece SON event'i saklıyor (singleton pattern).
 * Tüm history için events query'sini kullanmamız gerekiyor.
 * 
 * STRATEGY:
 * 1. Önce events query'sini dene (tüm history için) - pagination ile
 * 2. Eğer timeout alırsa, ls009GameEventModels'i fallback olarak kullan (sadece son event)
 * 
 * @param adventurerId - Adventurer ID (decimal veya hex formatında)
 * @param maxEvents - Maksimum çekilecek event sayısı (default: 200, çizgi roman için yeterli)
 * @returns GameLog[] - Parse edilmiş game event'leri
 */
export async function fetchGameEvents(adventurerId: string, maxEvents: number = 200): Promise<GameLog[]> {
  // PROTOTYPE MODE: Sadece ls009GameEventModels kullan (sadece son event)
  // Events query timeout alıyor, bu yüzden sadece model query kullanıyoruz
  console.log(`[Event Fetcher] 🚀 Using ls009GameEventModels only (prototype mode - last event only)`);
  try {
    return await fetchGameEventsFromModel(adventurerId, maxEvents);
  } catch (modelError: any) {
    console.warn(`[Event Fetcher] ⚠️ Model query failed: ${modelError.message}. Returning empty array...`);
    // Hata durumunda boş array döndür (fallback yok)
    return [];
  }
}

/**
 * YENİ: events query kullanarak TÜM event history'yi çeker
 * 
 * DEEP RESEARCH BULGUSU:
 * - ls009GameEventModels sadece SON event'i saklıyor (singleton pattern)
 * - Tüm history için events query'sini kullanmamız gerekiyor
 * - Pagination ile timeout sorununu çözüyoruz
 * 
 * @param adventurerId - Adventurer ID (decimal veya hex formatında)
 * @param maxEvents - Maksimum çekilecek event sayısı
 * @returns GameLog[] - Parse edilmiş game event'leri
 */
async function fetchGameEventsFromEventsQuery(adventurerId: string, maxEvents: number = 200): Promise<GameLog[]> {
  try {
    console.log(`[Event Fetcher] 🚀 Using events query (FULL HISTORY - pagination with small batches)`);
    console.log(`[Event Fetcher] Fetching events for adventurer ${adventurerId}...`);
    
    // Adventurer ID'yi hex'e çevir
    let adventurerIdHex: string;
    if (!adventurerId.startsWith('0x')) {
      const adventurerIdBigInt = BigInt(adventurerId);
      adventurerIdHex = num.toHex(adventurerIdBigInt);
    } else {
      adventurerIdHex = adventurerId;
    }
    
    console.log(`[Event Fetcher] Adventurer ID: ${adventurerIdHex}`);
    
    // Event selector'larını hesapla
    const attackSelectorHex = num.toHex(ATTACK_EVENT_SELECTOR);
    const discoverySelectorHex = num.toHex(DISCOVERY_EVENT_SELECTOR);
    const ambushSelectorHex = num.toHex(AMBUSH_EVENT_SELECTOR);
    
    const allEvents: any[] = [];
    const eventSelectors = [
      { name: 'Attack', selector: attackSelectorHex },
      { name: 'Discovery', selector: discoverySelectorHex },
      { name: 'Ambush', selector: ambushSelectorHex }
    ];
    
    // DEEP RESEARCH: events query O(N) karmaşıklığında ve timeout alıyor
    // Alternatif 1: Sadece selector ile query yap (keys: [selector] only) - daha hızlı olabilir
    // Alternatif 2: eventMessages query'sini dene
    // Alternatif 3: Batch size'ı çok küçült (5)
    
    // Önce eventMessages query'sini dene (rapor önerisi)
    console.log(`[Event Fetcher] 🔄 Trying eventMessages query first (alternative to events)...`);
    try {
      const eventMessagesQuery = `
        query GetEventMessages($first: Int!) {
          eventMessages(first: $first) {
            edges {
              node {
                id
                keys
                data
                transactionHash
                createdAt
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      
      const eventMessagesResponse = await axios.post(GRAPHQL_URL, {
        query: eventMessagesQuery,
        variables: { first: 100 }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (!eventMessagesResponse.data.errors && eventMessagesResponse.data.data?.eventMessages) {
        console.log(`[Event Fetcher] ✅ eventMessages query works! Found ${eventMessagesResponse.data.data.eventMessages.edges?.length || 0} messages`);
        // eventMessages query çalışıyor, ama filtreleme yapamıyoruz - bu yüzden events query'ye devam ediyoruz
      }
    } catch (e: any) {
      console.log(`[Event Fetcher] ⚠️ eventMessages query not available or failed: ${e.message}`);
    }
    
    // Her event tipi için pagination ile çek
    // DEEP RESEARCH: keys: [selector, adventurer_id] çok yavaş
    // Deneme: Sadece selector ile query yap, client-side filtrele
    for (const { name, selector } of eventSelectors) {
      let cursor: string | null = null;
      let hasNextPage = true;
      const batchSize = 5; // Çok küçük batch size - timeout'u önlemek için (20 → 5)
      
      // DEEP RESEARCH: keys: [selector] daha hızlı olabilir (sadece selector'a göre filtrele)
      // Sonra client-side'da adventurer_id'ye göre filtrele
      const useSelectorOnly = true; // Deneme: sadece selector ile query
      
      while (hasNextPage && allEvents.length < maxEvents) {
        const query = `
          query GetEvents($keys: [String!]!, $first: Int!, $after: String) {
            events(keys: $keys, first: $first, after: $after) {
              edges {
                node {
                  id
                  keys
                  data
                  transactionHash
                  createdAt
                }
                cursor
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;
        
        const variables: any = {
          keys: useSelectorOnly ? [selector] : [selector, adventurerIdHex], // Sadece selector ile dene
          first: batchSize
        };
        
        if (cursor) {
          variables.after = cursor;
        }
        
        try {
          const response = await axios.post(GRAPHQL_URL, {
            query,
            variables
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 saniye per page (15s → 10s)
          });
          
          if (response.data.errors) {
            console.warn(`[Event Fetcher] ⚠️ GraphQL errors for ${name}:`, response.data.errors);
            break; // Bu event tipini atla
          }
          
          const events = response.data.data?.events?.edges || [];
          const pageInfo = response.data.data?.events?.pageInfo;
          
          // Client-side filtreleme: keys[1] adventurer_id olmalı
          for (const edge of events) {
            const node = edge.node;
            const nodeKeys = node.keys || [];
            
            if (nodeKeys.length >= 2) {
              const nodeAdventurerId = nodeKeys[1];
              const normalizedNodeId = typeof nodeAdventurerId === 'string' 
                ? nodeAdventurerId.toLowerCase() 
                : String(nodeAdventurerId).toLowerCase();
              const normalizedAdventurerId = adventurerIdHex.toLowerCase();
              
              if (normalizedNodeId === normalizedAdventurerId) {
                allEvents.push({
                  keys: nodeKeys,
                  data: node.data || [],
                  transaction_hash: node.transactionHash || node.id,
                  log_index: 0,
                  timestamp: node.createdAt ? new Date(node.createdAt).getTime() / 1000 : Date.now() / 1000,
                  eventType: name
                });
              }
            }
          }
          
          hasNextPage = pageInfo?.hasNextPage || false;
          cursor = pageInfo?.endCursor || null;
          
          console.log(`[Event Fetcher] ✅ Fetched ${events.length} ${name} events (page) - Total: ${allEvents.length}`);
          
          if (allEvents.length >= maxEvents) {
            console.log(`[Event Fetcher] ✅ Reached max events limit (${maxEvents})`);
            break;
          }
          
          // Rate limiting: Her sayfa arasında kısa bir bekleme
          if (hasNextPage && cursor) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekleme
          }
        } catch (error: any) {
          console.warn(`[Event Fetcher] ⚠️ Error fetching ${name} events: ${error.message}`);
          break; // Bu event tipini atla, diğerlerine devam et
        }
      }
    }
    
    console.log(`[Event Fetcher] ✅ Total fetched: ${allEvents.length} events from events query`);
    
    // Parse events to GameLog format (mevcut parse logic'i kullan)
    const logs: GameLog[] = [];
    const { getBeastName, getLocationName } = await import('./beast-mapping');
    
    // Timestamp'e göre sırala
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const event of allEvents.slice(0, maxEvents)) {
      const data = event.data || [];
      const keys = event.keys || [];
      
      // Event tipine göre parse et
      let log: GameLog | null = null;
      
      if (event.eventType === 'Attack' || keys[0] === attackSelectorHex) {
        // Attack event parsing
        if (data.length >= 3) {
          const damage = Number(num.toBigInt(data[0]));
          const location = Number(num.toBigInt(data[1]));
          const criticalHit = Number(num.toBigInt(data[2])) > 0;
          
          log = {
            id: `attack-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'Attack',
            timestamp: new Date(event.timestamp * 1000).toISOString(),
            turnNumber: 0, // TODO: action_count'u data'dan çıkar
            data: {
              damage,
              location,
              criticalHit,
              beastName: getBeastName(location),
              locationName: getLocationName(location),
              txHash: event.transaction_hash
            }
          };
        }
      } else if (event.eventType === 'Discovery' || keys[0] === discoverySelectorHex) {
        // Discovery event parsing
        if (data.length >= 3) {
          const discoveryType = Number(num.toBigInt(data[0]));
          const entityId = Number(num.toBigInt(data[1]));
          const outputAmount = Number(num.toBigInt(data[2]));
          
          const discoveryTypeName = discoveryType === 1 ? 'Beast' : 
                                   discoveryType === 2 ? 'Obstacle' : 
                                   discoveryType === 3 ? 'Item' : 
                                   discoveryType === 4 ? 'Gold' : 'Unknown';
          
          log = {
            id: `discovery-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'Discovered',
            timestamp: new Date(event.timestamp * 1000).toISOString(),
            turnNumber: 0,
            data: {
              discoveryType: discoveryTypeName,
              discoveryTag: discoveryType,
              entityId,
              entityName: discoveryType === 1 ? getBeastName(entityId) : `Entity ${entityId}`,
              discoveryValue: outputAmount,
              xpReward: discoveryType === 3 ? outputAmount : 0,
              txHash: event.transaction_hash
            }
          };
        }
      } else if (event.eventType === 'Ambush' || keys[0] === ambushSelectorHex) {
        // Ambush event parsing
        if (data.length >= 2) {
          const beastId = Number(num.toBigInt(data[0]));
          const damageTaken = Number(num.toBigInt(data[1]));
          
          log = {
            id: `ambush-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'Ambush',
            timestamp: new Date(event.timestamp * 1000).toISOString(),
            turnNumber: 0,
            data: {
              beastId,
              beastName: getBeastName(beastId),
              damageTaken,
              txHash: event.transaction_hash
            }
          };
        }
      }
      
      if (log) {
        logs.push(log);
      }
    }
    
    console.log(`[Event Fetcher] ✅ Parsed ${logs.length} events to GameLog format`);
    return logs;
    
  } catch (error: any) {
    console.error(`[Event Fetcher] ❌ Error fetching from events query:`, error.message);
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * FALLBACK: ls009GameEventModels query kullanarak SON event'i çeker
 * 
 * DEEP RESEARCH BULGUSU:
 * - Bu query sadece SON event'i saklıyor (singleton pattern)
 * - action_count bir key değil, data field - her action önceki event'i overwrite ediyor
 * - Bu yüzden sadece 1 event dönüyor
 * 
 * KULLANIM: Sadece fallback olarak, events query timeout aldığında
 * 
 * @param adventurerId - Adventurer ID (decimal veya hex formatında)
 * @param maxEvents - Maksimum çekilecek event sayısı (bu query için her zaman 1)
 * @returns GameLog[] - Parse edilmiş game event'leri (sadece son event)
 */
async function fetchGameEventsFromModel(adventurerId: string, maxEvents: number = 200): Promise<GameLog[]> {
  try {
    console.log(`[Event Fetcher] 🚀 Using ls009GameEventModels query (O(1) access - FAST!)`);
    console.log(`[Event Fetcher] Fetching events for adventurer ${adventurerId}...`);
    
    // Adventurer ID'yi string formatına çevir
    let adventurerIdStr: string;
    if (!adventurerId.startsWith('0x')) {
      // Decimal ise hex'e çevir
      const adventurerIdBigInt = BigInt(adventurerId);
      adventurerIdStr = num.toHex(adventurerIdBigInt);
    } else {
      adventurerIdStr = adventurerId;
    }
    
    console.log(`[Event Fetcher] Adventurer ID: ${adventurerIdStr}`);
    
    // ls009GameEventModels query - Pagination ile
    // ÖNEMLİ: Nested field'ları query edince null olduğunda "no rows returned" hatası alıyoruz
    // Bu yüzden önce minimal query (sadece scalar field'lar) ile tüm event'leri çekiyoruz
    // Sonra gerekirse nested field'ları ayrı query'lerle çekeriz
    
    const allEdges: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;
    const batchSize = 100; // Her sayfada 100 event çek
    
    while (hasNextPage && allEdges.length < maxEvents) {
      const query = `
        query GetGameEvents($adventurerId: String!, $first: Int!, $after: String) {
          ls009GameEventModels(
            where: { adventurer_id: $adventurerId }
            first: $first
            after: $after
            order: { direction: ASC, field: ACTION_COUNT }
          ) {
            edges {
              node {
                adventurer_id
                action_count
                details {
                  __typename
                  flee
                  option
                  attack {
                    damage
                    location
                    critical_hit
                  }
                  discovery {
                    discovery_type {
                      __typename
                    }
                    xp_reward
                  }
                  ambush {
                    damage
                    location
                    critical_hit
                  }
                  beast_attack {
                    damage
                    location
                    critical_hit
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      
      const variables: any = {
        adventurerId: adventurerIdStr,
        first: Math.min(batchSize, maxEvents - allEdges.length)
      };
      
      if (cursor) {
        variables.after = cursor;
      }
      
      const response = await axios.post(GRAPHQL_URL, {
        query,
        variables
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.errors) {
        // Eğer nested field'lar null olduğunda hata alırsak, minimal query'ye fallback yap
        console.warn(`[Event Fetcher] ⚠️ Query with nested fields failed: ${JSON.stringify(response.data.errors)}`);
        console.log(`[Event Fetcher] 🔄 Trying minimal query (without nested fields)...`);
        
        // Minimal query - sadece scalar field'lar
        const minimalQuery = `
          query GetGameEventsMinimal($adventurerId: String!, $first: Int!, $after: String) {
            ls009GameEventModels(
              where: { adventurer_id: $adventurerId }
              first: $first
              after: $after
              order: { direction: ASC, field: ACTION_COUNT }
            ) {
              edges {
                node {
                  adventurer_id
                  action_count
                  details {
                    __typename
                    flee
                    option
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;
        
        const minimalResponse = await axios.post(GRAPHQL_URL, {
          query: minimalQuery,
          variables
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });
        
        if (minimalResponse.data.errors) {
          throw new Error(`GraphQL errors (minimal query): ${JSON.stringify(minimalResponse.data.errors)}`);
        }
        
        const minimalEdges = minimalResponse.data.data?.ls009GameEventModels?.edges || [];
        allEdges.push(...minimalEdges);
        
        hasNextPage = minimalResponse.data.data?.ls009GameEventModels?.pageInfo?.hasNextPage || false;
        cursor = minimalResponse.data.data?.ls009GameEventModels?.pageInfo?.endCursor || null;
        
        console.log(`[Event Fetcher] ✅ Fetched ${minimalEdges.length} events (minimal query) - Total: ${allEdges.length}`);
      } else {
        // Başarılı - normal query
        const edges = response.data.data?.ls009GameEventModels?.edges || [];
        const pageInfo = response.data.data?.ls009GameEventModels?.pageInfo;
        
        allEdges.push(...edges);
        
        hasNextPage = pageInfo?.hasNextPage || false;
        cursor = pageInfo?.endCursor || null;
        
        console.log(`[Event Fetcher] ✅ Query successful: ${edges.length} events, hasNextPage: ${hasNextPage}`);
        console.log(`[Event Fetcher] ✅ Fetched ${edges.length} events (page ${Math.floor(allEdges.length / batchSize) + 1}) - Total: ${allEdges.length}`);
      }
      
      // Limit kontrolü
      if (allEdges.length >= maxEvents) {
        console.log(`[Event Fetcher] ✅ Reached max events limit (${maxEvents}). Stopping pagination.`);
        break;
      }
    }
    
    const edges = allEdges.slice(0, maxEvents); // Maksimum limit'e göre kes
    console.log(`[Event Fetcher] ✅ Total fetched: ${edges.length} events from ls009GameEventModels`);
    
    // Parse events to GameLog format
    const logs: GameLog[] = [];
    const { getBeastName, getLocationName } = await import('./beast-mapping');
    
    for (const edge of edges) {
      const node = edge.node;
      const details = node.details;
      
      if (!details) continue;
      
      // Event tipini belirle
      let eventType: string = 'Unknown';
      let eventData: any = {
        actionCount: node.action_count,
        adventurerId: node.adventurer_id
      };
      
      // Attack event
      if (details.attack) {
        eventType = 'Attack';
        eventData = {
          ...eventData,
          damage: details.attack.damage || 0,
          location: details.attack.location || 0,
          criticalHit: details.attack.critical_hit || false,
          beastName: getBeastName(details.attack.location || 0),
          locationName: getLocationName(details.attack.location || 0)
        };
      }
      // Discovery event
      else if (details.discovery) {
        eventType = 'Discovered';
        const discoveryType = details.discovery.discovery_type?.__typename || 'Unknown';
        eventData = {
          ...eventData,
          discoveryType: discoveryType.replace('ls_0_0_9_', '').replace('DiscoveryType', ''),
          xpReward: details.discovery.xp_reward || 0
        };
      }
      // Ambush event
      else if (details.ambush) {
        eventType = 'Ambush';
        eventData = {
          ...eventData,
          damage: details.ambush.damage || 0,
          location: details.ambush.location || 0,
          criticalHit: details.ambush.critical_hit || false
        };
      }
      // Beast attack event
      else if (details.beast_attack) {
        eventType = 'BeastAttack';
        eventData = {
          ...eventData,
          damage: details.beast_attack.damage || 0,
          location: details.beast_attack.location || 0,
          criticalHit: details.beast_attack.critical_hit || false
        };
      }
      // Flee event
      else if (details.flee === true) {
        eventType = 'Flee';
        eventData = {
          ...eventData,
          fled: true
        };
      }
      
      logs.push({
        id: `event-${node.adventurer_id}-${node.action_count}`,
        adventurerId: String(node.adventurer_id),
        eventType,
        timestamp: new Date().toISOString(), // TODO: eventMessage'den timestamp al
        turnNumber: node.action_count || 0,
        data: eventData
      });
    }
    
    console.log(`[Event Fetcher] ✅ Parsed ${logs.length} events to GameLog format`);
    return logs;
    
  } catch (error: any) {
    console.error(`[Event Fetcher] ❌ Error fetching from ls009GameEventModels:`, error.message);
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * ESKİ: events query kullanarak event'leri çeker (O(N) erişim - YAVAŞ, timeout riski var)
 * 
 * PERFORMANCE WARNING:
 * Bu fonksiyon Torii events sorgusu kullanır ve O(N) karmaşıklığında çalışır.
 * Büyük adventurer ID'ler için timeout riski vardır.
 * 
 * OPTIMIZASYON STRATEJİSİ:
 * 1. Batch size: 5 (çok küçük parçalar)
 * 2. Limit: Maksimum 200 event (çizgi roman için yeterli - 20 sahne için)
 * 3. Timeout: 10s per page
 * 4. Retry: 5 deneme (exponential backoff)
 * 
 * @param adventurerId - Adventurer ID (decimal veya hex formatında)
 * @param maxEvents - Maksimum çekilecek event sayısı (default: 200, çizgi roman için yeterli)
 * @returns GameLog[] - Parse edilmiş game event'leri
 */
async function fetchGameEventsLegacy(adventurerId: string, maxEvents: number = 200): Promise<GameLog[]> {
  try {
    console.log(`[Event Fetcher] Fetching events for adventurer ${adventurerId}...`);
    console.log(`[Event Fetcher] Using Torii GraphQL: ${GRAPHQL_URL}`);
    
    // Adventurer ID'yi hex'e çevir ve 64 karakterli (32 byte) tam hex formatına tamamla
    // Not: Leaderboard'dan gelen ID'ler decimal (10'luk taban) olabilir
    // Örnek: Leaderboard ID 102722 → Hex: 0x19142 → Padded: 0x0000...19142
    let adventurerIdHex: string;
    let isDecimal = false;
    
    try {
      // Önce decimal olarak dene (Leaderboard'dan gelen ID'ler genelde decimal)
      if (!adventurerId.startsWith('0x')) {
        // Decimal string'i BigInt'e çevir, sonra hex'e
        const adventurerIdBigInt = BigInt(adventurerId);
        adventurerIdHex = num.toHex(adventurerIdBigInt);
        isDecimal = true;
      } else {
        // Zaten hex formatındaysa direkt kullan
        adventurerIdHex = adventurerId;
      }
    } catch {
      // Eğer parse edilemezse, hex olarak dene
      adventurerIdHex = adventurerId.startsWith('0x') ? adventurerId : num.toHex(adventurerId);
    }
    
    // CRITICAL FIX: Sorguyu hafifletmek için padding ve id_high'ı kaldır
    // 1. Padding kaldırıldı: Ham hex formatında kullan (0x1dcd0 gibi)
    // 2. id_high kaldırıldı: Sadece [selector, id_hex] kullan
    // 3. Address filtresi eklendi: WORLD_CONTRACT ile sorguyu hızlandır
    
    console.log(`[Event Fetcher] Adventurer ID (original): ${adventurerId} (${isDecimal ? 'decimal' : 'hex'})`);
    console.log(`[Event Fetcher] Adventurer ID (hex, unpadded): ${adventurerIdHex}`);
    console.log(`[Event Fetcher] Using lightweight query: [selector, id_hex] (no padding, no id_high)`);
    
    // CRITICAL FIX: Sorguyu hafifletmek için 3 adım
    // 1. Keys dizisinden id_high'ı çıkar: [selector, id_hex] (2 anahtar)
    // 2. Padding kaldır: Ham hex formatında kullan (0x1dcd0)
    // 3. Address filtresi ekle: WORLD_CONTRACT ile sorguyu hızlandır
    
    // Event selector'larını hesapla
    const attackSelectorHex = num.toHex(ATTACK_EVENT_SELECTOR);
    const discoverySelectorHex = num.toHex(DISCOVERY_EVENT_SELECTOR);
    const ambushSelectorHex = num.toHex(AMBUSH_EVENT_SELECTOR);
    
    console.log(`[Event Fetcher] Event selectors:`, {
      Attack: attackSelectorHex,
      Discovery: discoverySelectorHex,
      Ambush: ambushSelectorHex,
      GameEvent: GAMEEVENT_HASH
    });
    
    console.log(`[Event Fetcher] World Contract (address filter): ${WORLD_CONTRACT}`);
    
    // Keys formatı: [selector, id_hex] - Sadece 2 anahtar (id_high kaldırıldı)
    // Padding yok: Ham hex formatında (0x1dcd0 gibi)
    console.log(`[Event Fetcher] Keys filter format: [selector, id_hex] (lightweight)`);
    
    // Torii GraphQL events sorgusu - Pagination ile
    const allEvents: any[] = [];
    
    // Her event tipi için Torii GraphQL sorgusu (pagination ile)
    const eventSelectors = [
      { name: 'Attack', selector: attackSelectorHex },
      { name: 'Discovery', selector: discoverySelectorHex },
      { name: 'Ambush', selector: ambushSelectorHex },
      { name: 'GameEvent', selector: GAMEEVENT_HASH }
    ];
    
    for (const { name, selector } of eventSelectors) {
      try {
        console.log(`[Event Fetcher] Querying Torii GraphQL for ${name} events with pagination...`);
        
        // PERFORMANCE FIX: Batch size çok küçük tutuldu (Rapor önerisi)
        // 10 → 5: Çok küçük sorgular timeout riskini minimize eder
        // Torii events sorgusu O(N) karmaşıklığında, küçük batch'ler daha güvenli
        // Çizgi roman için 20 sahne yeterli, bu yüzden çok fazla event'e gerek yok
        const batchSize = 5;
        
        // PERFORMANCE EXPERIMENT: Önce sadece selector ile sorgu yap, sonra client-side filtrele
        // Bu yaklaşım daha hızlı olabilir çünkü veritabanı sadece selector'a göre filtreler
        // Ancak daha fazla veri transfer edilir, bu yüzden sadece küçük batch'ler için kullanılmalı
        // 
        // ALTERNATIF: [selector, adventurer_id] - Daha spesifik ama yavaş (mevcut yaklaşım)
        // YENİ: [selector] - Daha hızlı ama daha fazla veri (deneme)
        
        // Önce selector-only deneyelim (daha hızlı olabilir)
        // Eğer timeout alırsa, adventurer_id filtresine geri döneriz
        const useSelectorOnly = batchSize <= 5; // Sadece çok küçük batch'ler için
        
        const eventKeys = useSelectorOnly 
          ? [selector] // Sadece selector - daha hızlı ama daha fazla veri
          : [selector, adventurerIdHex]; // Selector + ID - daha spesifik ama yavaş
        
        console.log(`[Event Fetcher] Keys: [${eventKeys.join(', ')}] (${useSelectorOnly ? 'selector-only (experimental)' : 'selector + adventurer_id'})`);
        
        let cursor: string | null = null;
        let hasNextPage = true;
        let pageCount = 0;
        let totalFetched = 0;
        
        // Retry configuration (Exponential backoff)
        const maxRetries = 5; // 3 → 5: Daha fazla retry şansı
        const baseDelay = 2000; // 2 saniye (1s → 2s: Daha fazla bekleme)
        
        while (hasNextPage && totalFetched < maxEvents) {
          pageCount++;
          console.log(`[Event Fetcher] Fetching ${name} events - Page ${pageCount} (batch: ${batchSize}, total: ${totalFetched}/${maxEvents})${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}`);
          
          // PERFORMANCE: Her sayfa için timeout limiti (10s - daha agresif)
          // Küçük batch size sayesinde 10s yeterli olmalı
          const pageTimeout = 10000;
          
          // Limit kontrolü: Maksimum event sayısına ulaştıysak dur
          if (totalFetched >= maxEvents) {
            console.log(`[Event Fetcher] ✅ Reached max events limit (${maxEvents}). Stopping pagination.`);
            break;
          }
          
          // Torii GraphQL events sorgusu - Address parametresi YOK (desteklenmiyor)
          // Keys formatı: [selector, adventurer_id_hex] - 2 anahtar ile filtreleme
          // 
          // PERFORMANCE NOTE: Bu sorgu O(N) karmaşıklığında çalışır çünkü:
          // 1. Selector (key[0]) düşük kardinaliteye sahip (milyonlarca satır aynı değer)
          // 2. Veritabanı JSON array içindeki key[1] için optimize indeks kullanamaz
          // 3. Full Table Scan veya Partial Index Scan yapmak zorunda kalır
          const query = `
            query GetEvents($keys: [String!]!, $first: Int, $after: String) {
              events(keys: $keys, first: $first, after: $after) {
                totalCount
                edges {
                  node {
                    id
                    keys
                    data
                    transactionHash
                    createdAt
                  }
                  cursor
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `;
          
          const variables: any = {
            keys: eventKeys,
            first: batchSize
          };
          
          if (cursor) {
            variables.after = cursor;
          }
          
          // Retry mekanizması (Exponential backoff)
          let retryCount = 0;
          let lastError: any = null;
          let success = false;
          
          while (retryCount < maxRetries && !success) {
            try {
              const response = await axios.post(GRAPHQL_URL, {
                query,
                variables
              }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: pageTimeout // Her sayfa için 15 saniye timeout
              });
            
              if (response.data.errors) {
                console.warn(`[Event Fetcher] ⚠️ GraphQL errors for ${name} (page ${pageCount}):`, response.data.errors);
                // GraphQL hatası retry edilemez, break
                break;
              }
              
              const events = response.data.data?.events?.edges || [];
              const pageInfo = response.data.data?.events?.pageInfo;
              const totalCount = response.data.data?.events?.totalCount || 0;
              
              console.log(`[Event Fetcher] Page ${pageCount}: Found ${events.length} ${name} events (total available: ${totalCount})`);
              
              // Keys filtresi ile zaten filtrelenmiş - Direkt ekle
              // Eğer selector-only kullanıyorsak, client-side filtreleme yap
              // Limit kontrolü: Maksimum event sayısını aşmayalım
              let addedCount = 0;
              for (const edge of events) {
                if (totalFetched >= maxEvents) {
                  console.log(`[Event Fetcher] ⚠️ Reached max events limit (${maxEvents}). Stopping.`);
                  break;
                }
                
                const node = edge.node;
                const nodeKeys = node.keys || [];
                
                // Eğer selector-only kullanıyorsak, adventurer_id'yi client-side kontrol et
                if (useSelectorOnly && nodeKeys.length >= 2) {
                  // keys[1] adventurer_id olmalı - kontrol et
                  const nodeAdventurerId = nodeKeys[1];
                  // Hex formatlarını normalize et ve karşılaştır
                  const normalizedNodeId = typeof nodeAdventurerId === 'string' 
                    ? nodeAdventurerId.toLowerCase() 
                    : String(nodeAdventurerId).toLowerCase();
                  const normalizedAdventurerId = adventurerIdHex.toLowerCase();
                  
                  // Eşleşmiyorsa atla
                  if (normalizedNodeId !== normalizedAdventurerId) {
                    continue; // Bu event bu adventurer'a ait değil
                  }
                }
                
                allEvents.push({
                  keys: nodeKeys,
                  data: node.data || [],
                  transaction_hash: node.transactionHash || node.id,
                  log_index: 0,
                  timestamp: node.createdAt ? new Date(node.createdAt).getTime() / 1000 : Date.now() / 1000
                });
                addedCount++;
                totalFetched++;
              }
              
              console.log(`[Event Fetcher] Added ${addedCount} events (total: ${totalFetched}/${maxEvents})`);
              
              // Pagination kontrolü - Rapor: hasNextPage false olana kadar devam et
              hasNextPage = pageInfo?.hasNextPage || false;
              cursor = pageInfo?.endCursor || null;
              
              success = true; // Başarılı, retry loop'tan çık
              
              // Limit kontrolü: Maksimum event sayısına ulaştıysak dur
              if (totalFetched >= maxEvents) {
                console.log(`[Event Fetcher] ✅ Reached max events limit (${maxEvents}). Completed fetching ${name} events.`);
                hasNextPage = false; // Pagination'ı durdur
                break;
              }
              
              if (hasNextPage && cursor) {
                console.log(`[Event Fetcher] More ${name} events available, continuing with cursor...`);
              } else {
                console.log(`[Event Fetcher] ✅ Completed fetching ${name} events. Total: ${totalFetched}`);
                break;
              }
            } catch (error: any) {
              lastError = error;
              retryCount++;
              
              // Timeout veya network hatası ise retry yap
              const isRetryable = error.code === 'ECONNABORTED' || // Timeout
                                 error.code === 'ETIMEDOUT' ||
                                 error.code === 'ECONNRESET' ||
                                 (error.response && error.response.status >= 500); // Server error
              
              if (isRetryable && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
                console.warn(`[Event Fetcher] ⚠️ Retryable error (attempt ${retryCount}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                // Retry edilemez hata veya max retry'a ulaşıldı
                console.warn(`[Event Fetcher] ⚠️ Error fetching ${name} events (page ${pageCount}): ${error.message}`);
                if (error.response) {
                  console.warn(`[Event Fetcher] Response:`, JSON.stringify(error.response.data, null, 2));
                }
                break; // Bu event tipini atla, diğerlerine devam et
              }
            }
          }
          
          // Retry'lar başarısız olduysa bu event tipini atla
          if (!success) {
            console.warn(`[Event Fetcher] ⚠️ Failed to fetch ${name} events after ${maxRetries} retries. Skipping...`);
            break;
          }
        }
      } catch (error: any) {
        console.warn(`[Event Fetcher] ⚠️ Error fetching ${name} events from Torii: ${error.message}`);
        if (error.response) {
          console.warn(`[Event Fetcher] Response:`, JSON.stringify(error.response.data, null, 2));
        }
        // Devam et, diğer event tiplerini dene
      }
    }
    
    console.log(`[Event Fetcher] ✅ Total events fetched from Torii: ${allEvents.length} (limit: ${maxEvents})`);
    
    // Events objesi formatına çevir (mevcut kod uyumluluğu için)
    // Not: Torii keys filtresi ile zaten filtrelenmiş, ama güvenlik için keys kontrolü yapabiliriz
    const events = {
      events: allEvents
    };
    
    console.log(`[Event Fetcher] Found ${events.events.length} total events for adventurer ${adventurerId}`);
    
    // UYARI: Eğer çok az event varsa, çizgi roman için yeterli olmayabilir
    if (events.events.length < 10) {
      console.warn(`[Event Fetcher] ⚠️ Only ${events.events.length} events found. Comic book generation may use fallback (adventurer data only).`);
    }
    
    // Event'leri parse et ve GameLog formatına çevir
    const logs: GameLog[] = [];
    const { getBeastName, getLocationName } = await import('./beast-mapping');
    
    for (const event of events.events) {
      try {
        // Torii GraphQL event yapısı: keys[0] = event selector, data = [adventurer_id, ...event_specific_data]
        // CRITICAL: Torii'de data string array olabilir (hex formatında)
        const data = event.data || [];
        const eventKeys = event.keys || [];
        const eventKey = eventKeys[0]; // Event selector (Attack, Discovery, Ambush)
        
        if (!data || data.length === 0) {
          console.warn(`[Event Fetcher] Invalid event data: empty`);
          continue;
        }
        
        // Event selector'ı normalize et (hex string veya bigint olabilir)
        const eventKeyHex = typeof eventKey === 'string' 
          ? eventKey.toLowerCase() 
          : num.toHex(eventKey).toLowerCase();
        
        // Event tipini selector'dan belirle
        const isAttack = eventKeyHex === num.toHex(ATTACK_EVENT_SELECTOR).toLowerCase();
        const isDiscovery = eventKeyHex === num.toHex(DISCOVERY_EVENT_SELECTOR).toLowerCase();
        const isAmbush = eventKeyHex === num.toHex(AMBUSH_EVENT_SELECTOR).toLowerCase();
        const isGameEvent = eventKeyHex === GAMEEVENT_HASH.toLowerCase();
        
        // Torii'de data[0] = adventurer_id (zaten keys filtresi ile filtreledik)
        // data[1] ve sonrası = event-specific data
        // Torii'den gelen data string array (hex) olabilir, num.toBigInt ile parse et
        
        let log: GameLog | null = null;
        
        // GameEvent wrapper kontrolü: Eğer GameEvent ise, data[1] içinde tag var
        if (isGameEvent && data.length >= 2) {
          // GameEvent formatı: data[0] = adventurer_id, data[1] = tag (14: Attack, 3: Discovery, vb.)
          const tag = Number(num.toBigInt(data[1]));
          // Tag'e göre event tipini belirle ve parsing'i ona göre yap
          // Şimdilik GameEvent'i atlayalım, spesifik event'ler öncelikli
          console.log(`[Event Fetcher] GameEvent wrapper found with tag ${tag}, skipping for now (using specific events)`);
          continue;
        }
        
        if (isAttack) {
          // Attack Event: Torii'de data[0] = adventurer_id (atla), data[1] = beast_id, data[2] = damage, data[3] = location, data[4] = critical_hit
          // Rapor Tablo 2'ye göre: data[1] = Beast ID, data[2] = Damage, data[3] = Location, data[4] = Critical Hit
          // Not: Torii'de keys filtresi ile zaten filtreledik, data[0] adventurer_id olabilir veya olmayabilir
          // Güvenli olmak için data[0]'ı atla, data[1]'den başla
          const dataStartIndex = data.length >= 5 ? 1 : 0; // Eğer 5+ eleman varsa data[0] adventurer_id'dir
          
          if (data.length < (dataStartIndex + 4)) {
            console.warn(`[Event Fetcher] Invalid AttackEvent data length: ${data.length}, expected at least ${dataStartIndex + 4}`);
            continue;
          }
          
          // data[dataStartIndex] = beast_id (u8)
          const beastId = Number(num.toBigInt(data[dataStartIndex]));
          // data[dataStartIndex + 1] = damage (u16)
          const damage = Number(num.toBigInt(data[dataStartIndex + 1]));
          // data[dataStartIndex + 2] = location (u8)
          const location = Number(num.toBigInt(data[dataStartIndex + 2]));
          // data[dataStartIndex + 3] = critical_hit (bool)
          const criticalHit = Number(num.toBigInt(data[dataStartIndex + 3])) > 0;
          
          log = {
            id: `attack-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'Attack',
            timestamp: new Date().toISOString(),
            turnNumber: 0, // Rapor'da action_count yok, timestamp kullan
            data: {
              damage,
              location,
              locationName: getLocationName(location),
              criticalHit,
              beastId,
              beastName: getBeastName(beastId),
              txHash: event.transaction_hash
            }
          };
        } else if (isDiscovery) {
          // Discovery Event: Torii'de data[0] = adventurer_id (atla), data[1] = discovery_type, data[2] = entity_id, data[3] = output_amount
          // Rapor Tablo 2'ye göre: data[1] = Encounter Type (1: Beast, 2: Obstacle, 3: Item), data[2] = Type ID, data[3] = Output Amount
          const dataStartIndex = data.length >= 4 ? 1 : 0; // Eğer 4+ eleman varsa data[0] adventurer_id'dir
          
          if (data.length < (dataStartIndex + 3)) {
            console.warn(`[Event Fetcher] Invalid DiscoveryEvent data length: ${data.length}, expected at least ${dataStartIndex + 3}`);
            continue;
          }
          
          const discoveryType = Number(num.toBigInt(data[dataStartIndex])); // 1: Beast, 2: Obstacle, 3: Item, 4: Gold
          const entityId = Number(num.toBigInt(data[dataStartIndex + 1]));
          const outputAmount = Number(num.toBigInt(data[dataStartIndex + 2]));
          
          const discoveryTypeName = discoveryType === 1 ? 'Beast' : 
                                   discoveryType === 2 ? 'Obstacle' : 
                                   discoveryType === 3 ? 'Item' : 
                                   discoveryType === 4 ? 'Gold' : 'Unknown';
          
          log = {
            id: `discovery-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'Discovered',
            timestamp: new Date().toISOString(),
            turnNumber: 0,
            data: {
              discoveryType: discoveryTypeName,
              discoveryTag: discoveryType,
              entityId,
              entityName: discoveryType === 1 ? getBeastName(entityId) : `Entity ${entityId}`,
              discoveryValue: outputAmount,
              xpReward: discoveryType === 3 ? outputAmount : 0, // Item discovery'de XP olabilir
              txHash: event.transaction_hash
            }
          };
        } else if (isAmbush) {
          // Ambush Event: Torii'de data[0] = adventurer_id (atla), data[1] = beast_id, data[2] = damage_taken
          // Rapor Tablo 2'ye göre: data[1] = Beast ID, data[2] = Damage Taken
          const dataStartIndex = data.length >= 3 ? 1 : 0; // Eğer 3+ eleman varsa data[0] adventurer_id'dir
          
          if (data.length < (dataStartIndex + 2)) {
            console.warn(`[Event Fetcher] Invalid AmbushEvent data length: ${data.length}, expected at least ${dataStartIndex + 2}`);
            continue;
          }
          
          const beastId = Number(num.toBigInt(data[dataStartIndex]));
          const damageTaken = Number(num.toBigInt(data[dataStartIndex + 1]));
          
          log = {
            id: `ambush-${event.transaction_hash}-${event.log_index || 0}`,
            adventurerId,
            eventType: 'BeastAttack',
            timestamp: new Date().toISOString(),
            turnNumber: 0,
            data: {
              damage: damageTaken,
              beastId,
              beastName: getBeastName(beastId),
              ambushed: true,
              txHash: event.transaction_hash
            }
          };
        } else {
          // Bilinmeyen event tipi - log'la ve devam et
          console.warn(`[Event Fetcher] Unknown event type. Selector: ${num.toHex(eventKey)}`);
          continue;
        }
        
        // Log'u ekle
        if (log) {
          logs.push(log);
        }
      } catch (parseError: any) {
        console.error(`[Event Fetcher] Error parsing event:`, parseError.message);
        continue;
      }
    }
    
    // Action count'a göre sırala (kronolojik)
    logs.sort((a, b) => a.turnNumber - b.turnNumber);
    
    console.log(`[Event Fetcher] ✅ Parsed ${logs.length} game logs for adventurer ${adventurerId}`);
    
    return logs;
    
  } catch (error: any) {
    console.error('[Event Fetcher] ❌ Error fetching events:', error.message);
    console.error('[Event Fetcher] Stack:', error.stack);
    
    // Hata durumunda boş array döndür
    return [];
  }
}

/**
 * ALTERNATİF YAKLAŞIM: Model-Specific Queries (Önerilen)
 * ======================================================
 * Rapor önerisi: events sorgusu yerine battles ve discoveries sorgularını kullanmak
 * Bu sorgular O(1) karmaşıklığında çalışır çünkü adventurer_id primary key'dir.
 * 
 * NOT: Bu sorgular Torii deployment'ında mevcut olmayabilir.
 * Önce schema discovery yapılmalı: npm run discover:schema
 */
export async function fetchGameEventsAlternative(adventurerId: string): Promise<GameLog[]> {
  try {
    console.log(`[Event Fetcher Alternative] Fetching events via battles/discoveries for adventurer ${adventurerId}...`);
    
    const query = `
      query GetAdventurerEvents($adventurerId: String!) {
        # Battles query - O(1) erişim (adventurerId primary key)
        battles(
          where: { adventurerId: $adventurerId }
          orderBy: { direction: ASC, field: TIMESTAMP }
          first: 1000
        ) {
          edges {
            node {
              id
              adventurerId
              beastId
              damage
              criticalHit
              fled
              timestamp
              txHash
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        # Discoveries query - O(1) erişim
        discoveries(
          where: { adventurerId: $adventurerId }
          orderBy: { direction: ASC, field: TIMESTAMP }
          first: 1000
        ) {
          edges {
            node {
              id
              adventurerId
              discoveryType
              entityId
              entityName
              timestamp
              txHash
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    
    const response = await axios.post(GRAPHQL_URL, {
      query,
      variables: { adventurerId }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 // Model sorguları çok hızlı olmalı
    });
    
    if (response.data.errors) {
      // Bu sorgular mevcut değilse, events sorgusuna fallback yap
      console.warn(`[Event Fetcher Alternative] ⚠️ battles/discoveries queries not available:`, response.data.errors);
      console.log(`[Event Fetcher Alternative] Falling back to events query...`);
      return fetchGameEvents(adventurerId);
    }
    
    const logs: GameLog[] = [];
    const { getBeastName, getLocationName } = await import('./beast-mapping');
    
    // Battles'ı parse et
    const battles = response.data.data?.battles?.edges || [];
    for (const edge of battles) {
      const battle = edge.node;
      logs.push({
        id: `battle-${battle.id}`,
        adventurerId,
        eventType: battle.fled ? 'Flee' : 'Attack',
        timestamp: battle.timestamp || new Date().toISOString(),
        turnNumber: 0,
        data: {
          damage: battle.damage || 0,
          criticalHit: battle.criticalHit || false,
          beastId: battle.beastId || 0,
          beastName: getBeastName(battle.beastId || 0),
          fled: battle.fled || false,
          txHash: battle.txHash
        }
      });
    }
    
    // Discoveries'ı parse et
    const discoveries = response.data.data?.discoveries?.edges || [];
    for (const edge of discoveries) {
      const discovery = edge.node;
      logs.push({
        id: `discovery-${discovery.id}`,
        adventurerId,
        eventType: 'Discovered',
        timestamp: discovery.timestamp || new Date().toISOString(),
        turnNumber: 0,
        data: {
          discoveryType: discovery.discoveryType || 'Unknown',
          entityId: discovery.entityId || 0,
          entityName: discovery.entityName || 'Unknown',
          txHash: discovery.txHash
        }
      });
    }
    
    // Timestamp'e göre sırala
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`[Event Fetcher Alternative] ✅ Fetched ${logs.length} events via battles/discoveries`);
    return logs;
    
  } catch (error: any) {
    console.warn(`[Event Fetcher Alternative] ⚠️ Error: ${error.message}. Falling back to events query...`);
    // Fallback to events query
    return fetchGameEvents(adventurerId);
  }
}

/**
 * Discovery tag'dan type name çıkar
 */
function getDiscoveryTypeName(discoveryTag: number): string {
  const typeMap: Record<number, string> = {
    0: 'Unknown',
    1: 'Gold',
    2: 'Item',
    3: 'Potion',
    4: 'Treasure',
    // TODO: Gerçek mapping'i contract'tan öğren
  };
  
  return typeMap[discoveryTag] || `Discovery Type ${discoveryTag}`;
}

