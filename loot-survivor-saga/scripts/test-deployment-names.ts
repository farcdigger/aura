// scripts/test-deployment-names.ts
// Farklı deployment adlarını test et

import axios from 'axios';

const POSSIBLE_DEPLOYMENTS = [
  'realms-world',
  'loot-survivor-mainnet',
  'loot-survivor-v2',
  'realmloot',
  'loot-survivor',
  'survivor',
  'realms'
];

const BASE_URL = 'https://api.cartridge.gg/x';

async function testDeployment(deploymentName: string): Promise<boolean> {
  const url = `${BASE_URL}/${deploymentName}/torii/graphql`;
  
  try {
    const response = await axios.post(
      url,
      {
        query: `
          query {
            __schema {
              queryType {
                name
              }
            }
          }
        `
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    // Eğer hata yoksa ve schema dönüyorsa, bu deployment çalışıyor
    if (response.data.data?.__schema) {
      return true;
    }
    return false;
  } catch (error: any) {
    if (error.response?.data?.error?.message) {
      // "deployment not found" hatası değilse, başka bir hata var (belki çalışıyor)
      if (!error.response.data.error.message.includes('not found')) {
        console.log(`  ⚠️  ${deploymentName}: ${error.response.data.error.message}`);
        return true; // Deployment var ama query hatası
      }
    }
    return false;
  }
}

async function testAll() {
  console.log('🔍 Testing possible deployment names...\n');

  for (const deployment of POSSIBLE_DEPLOYMENTS) {
    process.stdout.write(`Testing: ${deployment}... `);
    const works = await testDeployment(deployment);
    
    if (works) {
      console.log('✅ WORKS!');
      console.log(`\n🎯 Found working deployment: ${deployment}`);
      console.log(`   URL: https://api.cartridge.gg/x/${deployment}/torii/graphql\n`);
      return deployment;
    } else {
      console.log('❌');
    }
  }

  console.log('\n❌ No working deployment found. Try manual check:');
  console.log('   1. Check survivor.realms.world Network tab');
  console.log('   2. Check BibliothecaDAO GitHub repos');
  console.log('   3. Check Cartridge docs\n');
  return null;
}

testAll();








