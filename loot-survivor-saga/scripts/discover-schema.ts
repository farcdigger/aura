// scripts/discover-schema.ts
// Torii API schema'sını keşfet

import axios from 'axios';

const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';

async function discoverSchema() {
  console.log('🔍 Discovering Torii GraphQL Schema...\n');
  console.log(`URL: ${GRAPHQL_URL}\n`);

  try {
    // Introspection query - Tüm mevcut modelleri listele
    const introspectionQuery = `
      query {
        __schema {
          queryType {
            fields {
              name
              description
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
      }
    `;

    const response = await axios.post(GRAPHQL_URL, {
      query: introspectionQuery
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.errors) {
      console.error('❌ Errors:', JSON.stringify(response.data.errors, null, 2));
      return;
    }

    const fields = response.data.data?.__schema?.queryType?.fields || [];
    
    console.log('📋 Available Models:\n');
    
    // Adventurer ile ilgili modelleri filtrele
    const adventurerModels = fields.filter((f: any) => 
      f.name.toLowerCase().includes('adventurer')
    );

    console.log('🎯 Adventurer Models:');
    adventurerModels.forEach((field: any) => {
      console.log(`  - ${field.name}`);
      if (field.description) {
        console.log(`    Description: ${field.description}`);
      }
    });

    console.log('\n📦 All Models (first 20):');
    fields.slice(0, 20).forEach((field: any) => {
      console.log(`  - ${field.name}`);
    });

    if (fields.length > 20) {
      console.log(`\n... and ${fields.length - 20} more models`);
    }

    // Önerilen modeli test et
    const suggestedModel = adventurerModels.find((f: any) => 
      f.name.includes('Packed') && f.name.includes('ls009')
    ) || adventurerModels.find((f: any) => 
      f.name.includes('Packed')
    ) || adventurerModels[0];

    if (suggestedModel) {
      console.log(`\n🧪 Discovering fields for: ${suggestedModel.name}`);
      
      // Model'in field'larını keşfet (Type name: ls_0_0_9_AdventurerPacked)
      const fieldQuery = `
        query {
          __type(name: "ls_0_0_9_AdventurerPacked") {
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

      const fieldResponse = await axios.post(GRAPHQL_URL, {
        query: fieldQuery
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (fieldResponse.data.data?.__type) {
        console.log('\n📋 Available Fields:');
        fieldResponse.data.data.__type.fields.forEach((field: any) => {
          const typeName = field.type.name || field.type.ofType?.name || field.type.kind;
          console.log(`  - ${field.name} (${typeName})`);
        });
      } else if (fieldResponse.data.errors) {
        console.log('⚠️  Could not fetch fields:', fieldResponse.data.errors[0].message);
      }

      // Where input'u keşfet
      const whereInputQuery = `
        query {
          __type(name: "${suggestedModel.name.replace('Models', '')}WhereInput") {
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

      const whereResponse = await axios.post(GRAPHQL_URL, {
        query: whereInputQuery
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (whereResponse.data.data?.__type) {
        console.log('\n🔍 Where Input Fields:');
        whereResponse.data.data.__type.inputFields.forEach((field: any) => {
          console.log(`  - ${field.name} (${field.type.kind})`);
        });
      }

      // İlk birkaç kaydı çek (where olmadan)
      console.log(`\n🧪 Fetching first record (no filter)...`);
      const sampleQuery = `
        query {
          ${suggestedModel.name}(first: 1) {
            edges {
              node {
                __typename
              }
            }
          }
        }
      `;

      const sampleResponse = await axios.post(GRAPHQL_URL, {
        query: sampleQuery
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (sampleResponse.data.data) {
        console.log('✅ Sample query successful!');
        console.log('Response:', JSON.stringify(sampleResponse.data.data, null, 2));
      } else if (sampleResponse.data.errors) {
        console.log('❌ Sample query failed:', JSON.stringify(sampleResponse.data.errors, null, 2));
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

discoverSchema();

