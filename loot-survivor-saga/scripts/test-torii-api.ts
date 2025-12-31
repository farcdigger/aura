// scripts/test-torii-api.ts
// Torii API'yi test etmek için basit script

import axios from 'axios';

const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';

async function testToriiAPI() {
  const gameId = process.argv[2] || '133595';

  console.log('🧪 Testing Torii API...\n');
  console.log(`URL: ${GRAPHQL_URL}`);
  console.log(`Game ID: ${gameId}\n`);

  // Test 1: Introspection (Schema kontrolü)
  console.log('1️⃣ Testing Introspection...');
  try {
    const introspectionQuery = `
      query {
        __schema {
          queryType {
            name
            fields {
              name
              type {
                name
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(GRAPHQL_URL, {
      query: introspectionQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log('✅ Introspection successful!');
    console.log('Available queries:', response.data.data?.__schema?.queryType?.fields?.map((f: any) => f.name).join(', ') || 'N/A');
    console.log('');
  } catch (error: any) {
    console.error('❌ Introspection failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return;
  }

  // Test 2: Adventurer query (ls009AdventurerPackedModels - doğru sorgu)
  console.log('2️⃣ Testing Adventurer Query (ls009AdventurerPackedModels)...');
  try {
    const adventurerQuery = `
      query GetAdventurer($id: String!) {
        ls009AdventurerPackedModels(where: { adventurer_id: $id }, first: 1) {
          edges {
            node {
              adventurer_id
              packed
              entity {
                keys
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(GRAPHQL_URL, {
      query: adventurerQuery,
      variables: { id: gameId }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(response.data.errors, null, 2));
    } else {
      const edges = response.data.data?.ls009AdventurerPackedModels?.edges || [];
      if (edges.length > 0) {
        console.log('✅ Adventurer found!');
        console.log('Data:', JSON.stringify({
          adventurer_id: edges[0].node.adventurer_id,
          packed_length: edges[0].node.packed?.length || 0,
          has_packed: !!edges[0].node.packed
        }, null, 2));
      } else {
        console.log('⚠️  No adventurer found with ID:', gameId);
      }
    }
  } catch (error: any) {
    console.error('❌ Adventurer query failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 3: Events query (Çizgi roman için kritik!)
  console.log('\n3️⃣ Testing Events Query (for comic book generation)...');
  try {
    // Event selector'ları hesapla (Attack, Discovery, Ambush)
    const { hash, num } = await import('starknet');
    const ATTACK_SELECTOR_BIGINT = hash.starknetKeccak("Attack");
    const DISCOVERY_SELECTOR_BIGINT = hash.starknetKeccak("Discovery");
    
    // BigInt'i hex string'e çevir (GraphQL için)
    const ATTACK_SELECTOR = num.toHex(ATTACK_SELECTOR_BIGINT);
    const DISCOVERY_SELECTOR = num.toHex(DISCOVERY_SELECTOR_BIGINT);
    
    // Game ID'yi hex'e çevir
    let adventurerIdHex: string;
    if (!gameId.startsWith('0x')) {
      adventurerIdHex = num.toHex(BigInt(gameId));
    } else {
      adventurerIdHex = gameId;
    }

    console.log(`   Testing with adventurer ID: ${adventurerIdHex}`);
    console.log(`   Attack selector: ${ATTACK_SELECTOR}`);
    console.log(`   Discovery selector: ${DISCOVERY_SELECTOR}`);

    // Attack events sorgusu (küçük batch - optimize edilmiş)
    const eventsQuery = `
      query GetEvents($keys: [String!]!, $first: Int) {
        events(keys: $keys, first: $first) {
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

    // Test 1: Attack events (sadece 3 event - çok küçük batch)
    // PERFORMANCE: Batch size'ı 5'ten 3'e düşürdük (timeout riskini azaltmak için)
    console.log('   Testing Attack events (first 3 - optimized batch size)...');
    
    // EXPERIMENTAL: Önce selector-only deneyelim (daha hızlı olabilir)
    console.log('   ⚡ Trying selector-only approach (experimental - faster but more data)...');
    let attackResponse;
    let useSelectorOnly = true;
    
    try {
      // Selector-only sorgu (sadece selector, client-side filtreleme)
      attackResponse = await axios.post(GRAPHQL_URL, {
        query: eventsQuery,
        variables: {
          keys: [ATTACK_SELECTOR], // Sadece selector - daha hızlı olabilir
          first: 10 // Biraz daha fazla çek (client-side filtreleme yapacağız)
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 // 10 saniye timeout (daha agresif)
      });
      
      console.log('   ✅ Selector-only query succeeded!');
    } catch (selectorError: any) {
      if (selectorError.code === 'ECONNABORTED') {
        console.log('   ⚠️  Selector-only query timeout. Trying with adventurer_id filter...');
        useSelectorOnly = false;
        
        // Fallback: Selector + adventurer_id (daha spesifik ama yavaş)
        attackResponse = await axios.post(GRAPHQL_URL, {
          query: eventsQuery,
          variables: {
            keys: [ATTACK_SELECTOR, adventurerIdHex],
            first: 3 // Çok küçük batch
          }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000 // 15 saniye timeout
        });
      } else {
        throw selectorError;
      }
    }

    if (attackResponse.data.errors) {
      console.error('   ❌ Attack events query errors:', JSON.stringify(attackResponse.data.errors, null, 2));
    } else {
      let attackEvents = attackResponse.data.data?.events?.edges || [];
      const totalCount = attackResponse.data.data?.events?.totalCount || 0;
      
      // Eğer selector-only kullandıysak, client-side filtreleme yap
      if (useSelectorOnly) {
        console.log(`   📊 Raw events (before filtering): ${attackEvents.length}`);
        attackEvents = attackEvents.filter((edge: any) => {
          const nodeKeys = edge.node.keys || [];
          if (nodeKeys.length >= 2) {
            const nodeAdventurerId = nodeKeys[1];
            const normalizedNodeId = typeof nodeAdventurerId === 'string' 
              ? nodeAdventurerId.toLowerCase() 
              : String(nodeAdventurerId).toLowerCase();
            const normalizedAdventurerId = adventurerIdHex.toLowerCase();
            return normalizedNodeId === normalizedAdventurerId;
          }
          return false;
        });
        console.log(`   ✅ Filtered events (after client-side filtering): ${attackEvents.length}`);
      }
      
      console.log(`   ✅ Attack events: Found ${attackEvents.length} events (total available: ${totalCount})`);
      
      if (attackEvents.length > 0) {
        console.log('   Sample event:', {
          id: attackEvents[0].node.id.substring(0, 20) + '...',
          keys: attackEvents[0].node.keys || [],
          keys_count: attackEvents[0].node.keys?.length || 0,
          data_count: attackEvents[0].node.data?.length || 0,
          has_tx_hash: !!attackEvents[0].node.transactionHash,
          timestamp: attackEvents[0].node.createdAt || 'N/A'
        });
        console.log('   🎉 SUCCESS! Events are working! Comic book generation should work!');
      } else {
        console.log('   ⚠️  No events found for this adventurer. They may not have any Attack events.');
      }
    }

    // Test 2: Discovery events (sadece 3 event - çok küçük batch)
    console.log('\n   Testing Discovery events (first 3 - optimized batch size)...');
    
    let discoveryResponse;
    let useSelectorOnlyDiscovery = true;
    
    try {
      // Selector-only sorgu
      discoveryResponse = await axios.post(GRAPHQL_URL, {
        query: eventsQuery,
        variables: {
          keys: [DISCOVERY_SELECTOR], // Sadece selector
          first: 10
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      console.log('   ✅ Selector-only query succeeded!');
    } catch (selectorError: any) {
      if (selectorError.code === 'ECONNABORTED') {
        console.log('   ⚠️  Selector-only query timeout. Trying with adventurer_id filter...');
        useSelectorOnlyDiscovery = false;
        
        discoveryResponse = await axios.post(GRAPHQL_URL, {
          query: eventsQuery,
          variables: {
            keys: [DISCOVERY_SELECTOR, adventurerIdHex],
            first: 3
          }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });
      } else {
        throw selectorError;
      }
    }

    if (discoveryResponse.data.errors) {
      console.error('   ❌ Discovery events query errors:', JSON.stringify(discoveryResponse.data.errors, null, 2));
    } else {
      let discoveryEvents = discoveryResponse.data.data?.events?.edges || [];
      const totalCount = discoveryResponse.data.data?.events?.totalCount || 0;
      
      // Client-side filtreleme (eğer selector-only kullandıysak)
      if (useSelectorOnlyDiscovery) {
        console.log(`   📊 Raw events (before filtering): ${discoveryEvents.length}`);
        discoveryEvents = discoveryEvents.filter((edge: any) => {
          const nodeKeys = edge.node.keys || [];
          if (nodeKeys.length >= 2) {
            const nodeAdventurerId = nodeKeys[1];
            const normalizedNodeId = typeof nodeAdventurerId === 'string' 
              ? nodeAdventurerId.toLowerCase() 
              : String(nodeAdventurerId).toLowerCase();
            const normalizedAdventurerId = adventurerIdHex.toLowerCase();
            return normalizedNodeId === normalizedAdventurerId;
          }
          return false;
        });
        console.log(`   ✅ Filtered events (after client-side filtering): ${discoveryEvents.length}`);
      }
      
      console.log(`   ✅ Discovery events: Found ${discoveryEvents.length} events (total available: ${totalCount})`);
      
      if (discoveryEvents.length > 0) {
        console.log('   🎉 SUCCESS! Discovery events are working!');
      }
    }

    console.log('\n✅ Events query test completed!');
    console.log('   If events are found, comic book generation should work.');
    console.log('   If timeout occurs, check network or try with smaller batch size.');

  } catch (error: any) {
    console.error('❌ Events query failed:', error.message);
    if (error.code === 'ECONNABORTED') {
      console.error('   ⚠️  TIMEOUT: Query took too long (>15s).');
      console.error('   💡 This is the performance issue we\'re trying to solve.');
      console.error('   💡 Try with smaller batch size or check network connection.');
    }
    if (error.response) {
      console.error('   Status:', error.response.status);
      if (error.response.data?.errors) {
        console.error('   GraphQL Errors:', JSON.stringify(error.response.data.errors, null, 2));
      }
    }
  }

  // Test 4: ls009GameEventModels (ALTERNATİF - Model-specific query, O(1) erişim olabilir)
  console.log('\n4️⃣ Testing ls009GameEventModels (ALTERNATİF - Model-specific query)...');
  console.log('   💡 This is a model-specific query, might be faster than events query!');
  console.log('   💡 Model queries use O(1) access (primary key lookup) instead of O(N) scan');
  
  try {
    // Önce schema'yı keşfet - hangi field'lar var?
    console.log('   🔍 Discovering ls009GameEventModels schema...');
    
    const schemaQuery = `
      query {
        __type(name: "ls_0_0_9_GameEvent") {
          name
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;
    
    const schemaResponse = await axios.post(GRAPHQL_URL, {
      query: schemaQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (schemaResponse.data.data?.__type) {
      console.log('   ✅ Schema found! Available fields:');
      schemaResponse.data.data.__type.fields.forEach((field: any) => {
        const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
        console.log(`      - ${field.name} (${typeName})`);
      });
    } else if (schemaResponse.data.errors) {
      console.log('   ⚠️  Could not fetch schema:', schemaResponse.data.errors[0].message);
    }
    
    // Şimdi where input'u keşfet
    console.log('   🔍 Discovering ls009GameEventModelsWhereInput...');
    
    const whereInputQuery = `
      query {
        __type(name: "ls009GameEventModelsWhereInput") {
          name
          inputFields {
            name
            type {
              name
              kind
            }
          }
        }
      }
    `;
    
    const whereInputResponse = await axios.post(GRAPHQL_URL, {
      query: whereInputQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (whereInputResponse.data.data?.__type) {
      console.log('   ✅ Where input found! Available filters:');
      whereInputResponse.data.data.__type.inputFields.forEach((field: any) => {
        console.log(`      - ${field.name} (${field.type.kind})`);
      });
    }
    
    // Order field'larını keşfet (EVENT_ID yok, hangi field'lar var?)
    console.log('   🔍 Discovering ls009GameEventModelsOrderField enum...');
    
    const orderFieldQuery = `
      query {
        __type(name: "ls_0_0_9_GameEventOrderField") {
          name
          enumValues {
            name
            description
          }
        }
      }
    `;
    
    const orderFieldResponse = await axios.post(GRAPHQL_URL, {
      query: orderFieldQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (orderFieldResponse.data.data?.__type) {
      console.log('   ✅ Order fields found! Available options:');
      orderFieldResponse.data.data.__type.enumValues.forEach((value: any) => {
        console.log(`      - ${value.name}${value.description ? ` (${value.description})` : ''}`);
      });
    }
    
    // Details field yapısını keşfet (subfield selection için)
    console.log('   🔍 Discovering ls_0_0_9_GameEventDetails structure...');
    
    const detailsTypeQuery = `
      query {
        __type(name: "ls_0_0_9_GameEventDetails") {
          name
          kind
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;
    
    const detailsTypeResponse = await axios.post(GRAPHQL_URL, {
      query: detailsTypeQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    if (detailsTypeResponse.data.data?.__type) {
      console.log('   ✅ Details structure found! Available subfields:');
      detailsTypeResponse.data.data.__type.fields?.forEach((field: any) => {
        const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
        console.log(`      - ${field.name} (${typeName})`);
      });
    } else if (detailsTypeResponse.data.errors) {
      console.log('   ⚠️  Could not fetch details structure:', detailsTypeResponse.data.errors[0]?.message);
    }
    
    // Şimdi gerçek sorguyu yap
    // RAPOR BULGUSU: order syntax'ı kullanılmalı (orderBy değil)
    // RAPOR BULGUSU: adventurer_id key olarak tanımlanmışsa keys ile sorgulama yapılabilir
    console.log('\n   🧪 Testing ls009GameEventModels query with adventurer_id filter...');
    console.log('   📝 Using order syntax (not orderBy) as per research report');
    
    // Önce where filtresi ile deneyelim
    // RAPOR: order field'ı EVENT_ID değil, muhtemelen CREATED_AT veya başka bir şey
    // RAPOR: details field'ı subfield selection gerektiriyor
    // Önce order field'ını ve details yapısını keşfettik, şimdi doğru sorguyu yapalım
    
    // Order field'ını kullan - ACTION_COUNT event sırasını belirler
    const orderField = 'ACTION_COUNT'; // EVENT_ID yok, ACTION_COUNT kullan
    console.log(`   📝 Using order field: ${orderField}`);
    
    // Details bir object type, optional field'lar içeriyor
    // Her event tipinin yapısını keşfet ve nested field'ları da keşfet
    console.log('   🔍 Discovering event type structures (attack, discovery, etc.)...');
    
    // AttackEvent yapısını keşfet (en önemli event)
    const attackEventQuery = `
      query {
        __type(name: "ls_0_0_9_AttackEvent") {
          name
          fields {
            name
            type {
              name
              kind
            }
          }
        }
      }
    `;
    
    const attackEventResponse = await axios.post(GRAPHQL_URL, {
      query: attackEventQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    let attackFields = '';
    if (attackEventResponse.data.data?.__type?.fields) {
      // Her field'ın tipini kontrol et
      attackFields = attackEventResponse.data.data.__type.fields
        .map((f: any) => {
          const typeKind = f.type.kind || f.type.ofType?.kind;
          if (typeKind === 'SCALAR' || typeKind === 'ENUM') {
            return f.name;
          } else if (typeKind === 'OBJECT') {
            return `${f.name} { __typename }`;
          } else {
            return f.name;
          }
        })
        .filter(Boolean)
        .join('\n              ');
      console.log(`   ✅ AttackEvent fields: ${attackEventResponse.data.data.__type.fields.map((f: any) => `${f.name} (${f.type.kind || f.type.ofType?.kind})`).join(', ')}`);
    }
    
    // DiscoveryEvent yapısını keşfet
    const discoveryEventQuery = `
      query {
        __type(name: "ls_0_0_9_DiscoveryEvent") {
          name
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;
    
    const discoveryEventResponse = await axios.post(GRAPHQL_URL, {
      query: discoveryEventQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    // discovery_type'ın yapısını keşfet (OBJECT ise)
    let discoveryTypeFields = '';
    let discoveryFields = '';
    
    if (discoveryEventResponse.data.data?.__type?.fields) {
      const fields = discoveryEventResponse.data.data.__type.fields;
      console.log(`   ✅ DiscoveryEvent fields: ${fields.map((f: any) => `${f.name} (${f.type.kind || f.type.ofType?.kind})`).join(', ')}`);
      
      // discovery_type field'ını bul ve yapısını keşfet
      const discoveryTypeField = fields.find((f: any) => f.name === 'discovery_type');
      if (discoveryTypeField) {
        const typeName = discoveryTypeField.type.name || discoveryTypeField.type.ofType?.name;
        if (typeName) {
          console.log(`   🔍 Discovering ${typeName} structure...`);
          const discoveryTypeStructQuery = `
            query {
              __type(name: "${typeName}") {
                name
                kind
                fields {
                  name
                  type {
                    name
                    kind
                  }
                }
                enumValues {
                  name
                }
              }
            }
          `;
          
          const discoveryTypeStructResponse = await axios.post(GRAPHQL_URL, {
            query: discoveryTypeStructQuery
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          if (discoveryTypeStructResponse.data.data?.__type) {
            if (discoveryTypeStructResponse.data.data.__type.kind === 'ENUM') {
              // Enum ise direkt kullan
              discoveryTypeFields = 'discovery_type';
              console.log(`   ✅ discovery_type is ENUM: ${discoveryTypeStructResponse.data.data.__type.enumValues.map((v: any) => v.name).join(', ')}`);
            } else if (discoveryTypeStructResponse.data.data.__type.fields) {
              // Object ise - bu muhtemelen bir union type wrapper
              // Field'ları kontrol et: Gold, Health, Loot, option muhtemelen boolean veya enum
              const fields = discoveryTypeStructResponse.data.data.__type.fields;
              console.log(`   🔍 discovery_type field types: ${fields.map((f: any) => `${f.name} (${f.type.kind || f.type.ofType?.kind})`).join(', ')}`);
              
              // discovery_type bir union type wrapper gibi görünüyor
              // Gold, Health, Loot, option muhtemelen boolean field'lar (sadece biri true)
              // Tüm field'ları query etmek yerine, sadece __typename kullan
              // Çünkü tüm field'ları query edince "no rows returned" hatası alıyoruz
              discoveryTypeFields = `discovery_type {\n                __typename\n              }`;
              console.log(`   💡 Using __typename for discovery_type (union type wrapper)`);
              console.log(`   ✅ discovery_type is OBJECT with fields: ${fields.map((f: any) => f.name).join(', ')}`);
            }
          }
        }
      }
      
      // Diğer scalar field'ları al
      const scalarFields = fields
        .filter((f: any) => f.name !== 'discovery_type' && (f.type.kind === 'SCALAR' || f.type.kind === 'ENUM'))
        .map((f: any) => f.name);
      
      discoveryFields = [discoveryTypeFields, ...scalarFields].filter(Boolean).join('\n              ');
    }
    
    // Details query - object type, optional field'lar
    // ÖNEMLİ: Tüm field'lar optional, sadece dolu olanlar döner
    // GraphQL'de optional field'lar null dönebilir, bu normal
    // Önce minimal query (sadece scalar field'lar)
    const detailsSelectionMinimal = `details {
            __typename
            flee
            option
          }`;
    
    // Tam query - şimdilik sadece scalar field'lar
    // ÖNEMLİ: Null field'lar için subfield selection yapmaya çalışınca "no rows returned" hatası alıyoruz
    // Çözüm: Sadece scalar field'ları query et, nested object'leri şimdilik atla
    // Eğer bu çalışırsa, nested field'ları tek tek ekleyeceğiz
    const detailsSelection = `details {
            __typename
            flee
            option
          }`;
    
    // Önce details olmadan test et (veri var mı kontrol et)
    const gameEventQuerySimple = `
      query GetGameEventsSimple($adventurerId: String!) {
        ls009GameEventModels(
          where: { adventurer_id: $adventurerId }
          first: 5
          order: { direction: ASC, field: ${orderField} }
        ) {
          edges {
            node {
              adventurer_id
              action_count
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
    
    console.log('   🧪 Testing simple query (without details) first...');
    try {
      const simpleResponse = await axios.post(GRAPHQL_URL, {
        query: gameEventQuerySimple,
        variables: { adventurerId: gameId }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      if (simpleResponse.data.errors) {
        console.log('   ❌ Simple query errors:', JSON.stringify(simpleResponse.data.errors, null, 2));
      } else {
        const events = simpleResponse.data.data?.ls009GameEventModels?.edges || [];
        console.log(`   ✅ Simple query succeeded! Found ${events.length} events`);
        if (events.length > 0) {
          console.log(`   📊 First event: adventurer_id=${events[0].node.adventurer_id}, action_count=${events[0].node.action_count}`);
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Simple query failed: ${error.message}`);
    }
    
    // Şimdi minimal details query test et
    console.log('   🧪 Testing minimal details query (only __typename, flee, option)...');
    const gameEventQueryMinimal = `
      query GetGameEventsMinimal($adventurerId: String!) {
        ls009GameEventModels(
          where: { adventurer_id: $adventurerId }
          first: 5
          order: { direction: ASC, field: ${orderField} }
        ) {
          edges {
            node {
              adventurer_id
              action_count
              ${detailsSelectionMinimal}
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
    
    try {
      const minimalResponse = await axios.post(GRAPHQL_URL, {
        query: gameEventQueryMinimal,
        variables: { adventurerId: gameId }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      if (minimalResponse.data.errors) {
        console.log('   ❌ Minimal details query errors:', JSON.stringify(minimalResponse.data.errors, null, 2));
      } else {
        const events = minimalResponse.data.data?.ls009GameEventModels?.edges || [];
        console.log(`   ✅ Minimal details query succeeded! Found ${events.length} events`);
        if (events.length > 0 && events[0].node.details) {
          console.log(`   📊 First event details: ${JSON.stringify(events[0].node.details, null, 2)}`);
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Minimal details query failed: ${error.message}`);
    }
    
    // Şimdi details ile tam query
    // ÖNEMLİ: entity field'ı null olabilir, bu yüzden şimdilik atlıyoruz
    // Minimal details query çalışıyor, şimdi entity field'ını kaldırıp test ediyoruz
    const gameEventQueryWhere = `
      query GetGameEvents($adventurerId: String!) {
        ls009GameEventModels(
          where: { adventurer_id: $adventurerId }
          first: 50
          order: { direction: ASC, field: ${orderField} }
        ) {
          edges {
            node {
              adventurer_id
              action_count
              ${detailsSelection}
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
    
    let gameEventResponse;
    try {
      gameEventResponse = await axios.post(GRAPHQL_URL, {
        query: gameEventQueryWhere,
        variables: { adventurerId: gameId }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 // Model query'ler çok hızlı olmalı
      });
      
      console.log('   ✅ Query with where filter succeeded!');
    } catch (whereError: any) {
      // Eğer where çalışmazsa, keys ile deneyelim (rapor: adventurer_id key olabilir)
      console.log('   ⚠️  Where filter failed, trying with keys...');
      
      const gameEventQueryKeys = `
        query GetGameEvents($adventurerId: String!) {
          ls009GameEventModels(
            keys: [$adventurerId]
            first: 50
            order: { direction: ASC, field: EVENT_ID }
          ) {
            edges {
              node {
                adventurer_id
                action_count
                details
                entity {
                  keys
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
      
      gameEventResponse = await axios.post(GRAPHQL_URL, {
        query: gameEventQueryKeys,
        variables: { adventurerId: gameId }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      console.log('   ✅ Query with keys filter succeeded!');
    }
    
    if (gameEventResponse.data.errors) {
      console.error('   ❌ ls009GameEventModels query errors:', JSON.stringify(gameEventResponse.data.errors, null, 2));
      
      // Eğer order field hatası varsa, farklı field'ları dene
      if (gameEventResponse.data.errors[0]?.message?.includes('EVENT_ID') || 
          gameEventResponse.data.errors[0]?.message?.includes('order')) {
        console.log('   💡 Order field might be different. Trying with CREATED_AT or without order...');
        
        const gameEventQueryNoOrder = `
          query GetGameEvents($adventurerId: String!) {
            ls009GameEventModels(
              where: { adventurer_id: $adventurerId }
              first: 50
            ) {
              edges {
                node {
                  adventurer_id
                  action_count
                  details
                  entity {
                    keys
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
        
        const noOrderResponse = await axios.post(GRAPHQL_URL, {
          query: gameEventQueryNoOrder,
          variables: { adventurerId: gameId }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        
        if (noOrderResponse.data.data?.ls009GameEventModels) {
          const gameEvents = noOrderResponse.data.data.ls009GameEventModels.edges || [];
          console.log(`   ✅ Query works without order! Found ${gameEvents.length} events`);
          if (gameEvents.length > 0) {
            console.log('   Sample event:', JSON.stringify(gameEvents[0].node, null, 2));
          }
          gameEventResponse = noOrderResponse; // Devam et
        }
      }
      
      // Eğer hala hata varsa, where input farklıysa deneme
      if (gameEventResponse.data.errors && gameEventResponse.data.errors[0]?.message?.includes('adventurer_id')) {
        console.log('   💡 adventurer_id field might not exist. Trying without filter...');
        
        const gameEventQueryNoFilter = `
          query {
            ls009GameEventModels(first: 5) {
              edges {
                node {
                  adventurer_id
                  action_count
                  details
                }
              }
            }
          }
        `;
        
        const noFilterResponse = await axios.post(GRAPHQL_URL, {
          query: gameEventQueryNoFilter
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        
        if (noFilterResponse.data.data?.ls009GameEventModels) {
          console.log('   ✅ Query works without filter! Sample data:');
          console.log('   ', JSON.stringify(noFilterResponse.data.data.ls009GameEventModels.edges[0]?.node || {}, null, 2));
        }
      }
    }
    
    // Eğer hata yoksa veya düzeltildiyse, sonuçları göster
    if (gameEventResponse && !gameEventResponse.data.errors) {
      const gameEvents = gameEventResponse.data.data?.ls009GameEventModels?.edges || [];
      const totalCount = gameEvents.length;
      const pageInfo = gameEventResponse.data.data?.ls009GameEventModels?.pageInfo;
      
      console.log(`   ✅ ls009GameEventModels: Found ${totalCount} events (O(1) access - FAST!)`);
      
      if (gameEvents.length > 0) {
        console.log('   🎉 SUCCESS! Model query works! This is MUCH faster than events query!');
        console.log('   Sample event structure:');
        const sample = gameEvents[0].node;
        console.log('   ', {
          adventurer_id: sample.adventurer_id,
          action_count: sample.action_count,
          has_details: !!sample.details,
          details_type: typeof sample.details,
          entity_keys: sample.entity?.keys || []
        });
        
        // Details field'ının içeriğini göster (eğer varsa)
        if (sample.details) {
          console.log('   Details field content:', JSON.stringify(sample.details, null, 2).substring(0, 200) + '...');
        }
        
        console.log('   💡 We can use this instead of events query for comic book generation!');
        console.log('   💡 This query is O(1) access - MUCH faster than events query!');
        
        if (pageInfo?.hasNextPage) {
          console.log(`   📄 More events available (cursor-based pagination supported)`);
        }
      } else {
        console.log('   ⚠️  No game events found for this adventurer.');
        console.log('   💡 This might mean:');
        console.log('      - Historical events not enabled in Torii config');
        console.log('      - This adventurer has no events');
        console.log('      - Different schema version (ls008 vs ls009)');
      }
    }
    
  } catch (error: any) {
    console.error('   ❌ ls009GameEventModels query failed:', error.message);
    if (error.code === 'ECONNABORTED') {
      console.error('   ⚠️  TIMEOUT: Even model query is slow (>10s).');
    }
    if (error.response) {
      console.error('   Status:', error.response.status);
      if (error.response.data?.errors) {
        console.error('   GraphQL Errors:', JSON.stringify(error.response.data.errors, null, 2));
      }
    }
  }
}

testToriiAPI();

