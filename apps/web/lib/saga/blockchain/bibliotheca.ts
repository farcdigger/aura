// src/lib/blockchain/bibliotheca.ts

import axios from 'axios';
import type { AdventurerData, GameLog } from '../types/game';
import { unpackAdventurer } from './felt252-decoder';

// Bibliotheca GraphQL API URL (Torii/Dojo)
// Deployment adı: pg-mainnet-10 (Console'dan bulundu)
// Torii URL: https://api.cartridge.gg/x/pg-mainnet-10/torii
// GraphQL endpoint: /graphql eklenir
const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';

/**
 * Belirli bir Game ID için oyun verilerini çeker
 */
export async function fetchGameData(gameId: string): Promise<{
  adventurer: AdventurerData;
  logs: GameLog[];
}> {
  // Torii/Dojo GraphQL Query Format
  // Model: ls009AdventurerPackedModels (en güncel versiyon)
  // Field: adventurer_id (u64) - ID için kullanılır
  // Game ID String (Decimal) formatında olmalı: "133595"
  const query = `
    query GetAdventurer($id: String!) {
      ls009AdventurerPackedModels(where: { adventurer_id: $id }, first: 1) {
        edges {
          node {
            adventurer_id
            packed
            entity {
              keys
              models {
                __typename
              }
            }
          }
        }
      }
      
      # Note: battles and discoveries queries are not available in this Torii deployment
      # We'll work with adventurer data only and generate scenes from stats/equipment
    }
  `;

  try {
    const response = await axios.post(GRAPHQL_URL, {
      query,
      variables: { id: gameId }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(response.data.errors)}`);
    }

    // Torii response formatı: ls009AdventurerPackedModels.edges[0].node
    const edges = response.data.data?.ls009AdventurerPackedModels?.edges || [];
    if (edges.length === 0) {
      throw new Error(`Game ID not found: ${gameId}`);
    }

    const node = edges[0].node;
    
    // Packed data'yı logla (debug için)
    console.log('[Bibliotheca] Packed data received:', {
      adventurer_id: node.adventurer_id,
      packed: node.packed?.substring(0, 50) + '...' || 'null',
      packed_length: node.packed?.length || 0,
      entity_keys: node.entity?.keys
    });

    // Packed data'yı decode et
    let unpackedData: Partial<AdventurerData> = {};
    let rawUnpackedData: any = null; // For debugging - contains full unpacked data including XP
    if (node.packed) {
      try {
        unpackedData = unpackAdventurer(node.packed);
        // Store raw unpacked data for debugging (includes XP values)
        rawUnpackedData = unpackedData;
        console.log('[Bibliotheca] ✅ Successfully decoded packed data');
      } catch (decodeError: any) {
        console.error('[Bibliotheca] ❌ Failed to decode packed data:', decodeError.message);
        console.warn('[Bibliotheca] ⚠️ Using minimal data as fallback');
      }
    } else {
      console.warn('[Bibliotheca] ⚠️ No packed data found in response');
    }
    
    // Torii formatından AdventurerData formatına dönüştür
    const adventurer: AdventurerData = {
      id: String(node.adventurer_id || gameId),
      owner: '', // Owner packed data'da değil, entity.keys'de olabilir veya ayrı query gerekebilir
      name: null, // Name packed data'da değil, ayrı query gerekebilir
      health: unpackedData.health ?? 0,
      xp: unpackedData.xp ?? 0,
      level: unpackedData.level ?? 0,
      gold: unpackedData.gold ?? 0,
      beast: unpackedData.beast ?? null,
      stats: unpackedData.stats ?? {
        strength: 0,
        dexterity: 0,
        vitality: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0
      },
      equipment: unpackedData.equipment ?? {
        weapon: null,
        chest: null,
        head: null,
        waist: null,
        foot: null,
        hand: null,
        neck: null,
        ring: null
      },
      lastAction: null
    };
    
    // Logs'ları Torii GraphQL ile event'lerden çek
    // SCHEMA DISCOVERY SONUCU: battles/discoveries sorguları mevcut DEĞİL
    // Sadece events sorgusu kullanılabilir, bu yüzden direkt events sorgusunu kullanıyoruz
    // PERFORMANCE: Maksimum 200 event çekiyoruz (çizgi roman için yeterli - 20 sahne)
    let logs: GameLog[] = [];
    try {
      const { fetchGameEvents } = await import('./event-fetcher');
      
      // Events sorgusunu kullan (optimize edilmiş: batch size 5, limit 200, retry 5)
      // Çizgi roman için 20 sahne yeterli, bu yüzden 200 event fazlasıyla yeterli
      logs = await fetchGameEvents(String(node.adventurer_id || gameId), 200);
      console.log(`[Bibliotheca] ✅ Fetched ${logs.length} game logs from events query (optimized)`);
      
      if (logs.length === 0) {
        console.warn(`[Bibliotheca] ⚠️ No events found. Will generate scenes from adventurer data only.`);
      } else if (logs.length < 10) {
        console.warn(`[Bibliotheca] ⚠️ Only ${logs.length} events found. Comic book may use fallback scenes.`);
      }
    } catch (eventError: any) {
      console.warn(`[Bibliotheca] ⚠️ Failed to fetch events: ${eventError.message}`);
      console.warn(`[Bibliotheca] ⚠️ Will generate scenes from adventurer data only.`);
      logs = [];
    }

    // Store raw unpacked data in adventurer for debugging (includes equipment XP)
    (adventurer as any).rawUnpackedData = rawUnpackedData;

    return { adventurer, logs };
  } catch (error: any) {
    console.error('Bibliotheca API Error:', error.message);
    
    // DNS/Network hatası için daha açıklayıcı mesaj
    if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
      throw new Error(
        `Cannot reach Bibliotheca API (Torii). Please check:\n` +
        `1. Internet connection\n` +
        `2. API URL: ${GRAPHQL_URL}\n` +
        `3. Try setting BIBLIOTHECA_GRAPHQL_URL in .env.local\n` +
        `4. Alternative: https://api.cartridge.gg/x/loot-survivor/torii/graphql`
      );
    }
    
    // GraphQL hatası
    if (error.response?.data?.errors) {
      const gqlErrors = error.response.data.errors;
      throw new Error(`GraphQL Error: ${JSON.stringify(gqlErrors)}`);
    }
    
    throw new Error(`Failed to fetch game data: ${error.message}`);
  }
}

/**
 * Kullanıcının cüzdan adresine göre oyunlarını listeler
 */
export async function fetchUserGames(walletAddress: string): Promise<AdventurerData[]> {
  // Torii format: adventurerModels with where filter
  const query = `
    query GetUserAdventurers($owner: String!) {
      adventurerModels(
        where: { owner: $owner }
        first: 50
        orderBy: { direction: DESC, field: CREATED_AT }
      ) {
        edges {
          node {
            id
            name
            level
            xp
            health
            gold
            createdAt
            diedAt
          }
        }
      }
      
      # Battles query - Torii format (alternatif: battleModels)
      battles(
        where: { adventurerId: $id }
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
        }
      }
      
      # Discoveries query - Torii format (alternatif: discoveryModels)
      discoveries(
        where: { adventurerId: $id }
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
        }
      }
    }
  `;

  try {
    const response = await axios.post(GRAPHQL_URL, {
      query,
      variables: { owner: walletAddress.toLowerCase() }
    });

    if (response.data.errors) {
      console.error('GraphQL Error:', response.data.errors);
      return [];
    }

    // Torii response formatından diziye dönüştür
    const edges = response.data.data?.adventurerModels?.edges || [];
    return edges.map((edge: any) => {
      const node = edge.node;
      return {
        id: node.id,
        owner: node.owner || walletAddress,
        name: node.name,
        health: node.health || 0,
        xp: node.xp || 0,
        level: node.level || 0,
        gold: node.gold || 0,
        beast: null,
        stats: {
          strength: 0,
          dexterity: 0,
          vitality: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0
        },
        equipment: {
          weapon: null,
          chest: null,
          head: null,
          waist: null,
          foot: null,
          hand: null,
          neck: null,
          ring: null
        },
        lastAction: null
      };
    });
  } catch (error: any) {
    console.error('Bibliotheca API Error:', error.message);
    return [];
  }
}

