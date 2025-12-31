// Script to test felt252 decoding
// Usage: npx tsx scripts/test-felt252-decode.ts <gameId>

import { fetchGameData } from '../src/lib/blockchain/bibliotheca';
import { unpackAdventurer } from '../src/lib/blockchain/felt252-decoder';
import { getItemName } from '../src/lib/blockchain/loot-items';
import axios from 'axios';

async function testDecode(gameId: string) {
  try {
    console.log('🔍 Testing Felt252 Decode for Game ID:', gameId);
    console.log('='.repeat(60));

    // Fetch game data from API
    console.log('\n📡 Fetching game data from Torii API...');
    const gameData = await fetchGameData(gameId);
    
    // Also decode directly to get XP values
    const GRAPHQL_URL = process.env.BIBLIOTHECA_GRAPHQL_URL || 'https://api.cartridge.gg/x/pg-mainnet-10/torii/graphql';
    const query = `
      query GetAdventurer($id: String!) {
        ls009AdventurerPackedModels(where: { adventurer_id: $id }, first: 1) {
          edges {
            node {
              adventurer_id
              packed
            }
          }
        }
      }
    `;
    const response = await axios.post(GRAPHQL_URL, {
      query,
      variables: { id: gameId }
    });
    const packedValue = response.data.data?.ls009AdventurerPackedModels?.edges?.[0]?.node?.packed;
    let equipmentWithXP: any = null;
    if (packedValue) {
      const decoded = unpackAdventurer(packedValue);
      // Get raw equipment data (with XP) from the unpacked data
      equipmentWithXP = (decoded as any).rawEquipment || decoded.equipment;
    }
    
    console.log('\n✅ Game data fetched successfully!');
    console.log('\n📊 Decoded Adventurer Data:');
    console.log('='.repeat(60));
    
    const adventurer = gameData.adventurer;
    
    console.log('\n👤 Basic Info:');
    console.log(`  ID: ${adventurer.id}`);
    console.log(`  Owner: ${adventurer.owner || 'N/A'}`);
    console.log(`  Name: ${adventurer.name || 'N/A'}`);
    console.log(`  Health: ${adventurer.health}`);
    console.log(`  XP: ${adventurer.xp}`);
    console.log(`  Level: ${adventurer.level}`);
    console.log(`  Gold: ${adventurer.gold}`);
    
    console.log('\n⚔️  Stats:');
    console.log(`  Strength: ${adventurer.stats.strength}`);
    console.log(`  Dexterity: ${adventurer.stats.dexterity}`);
    console.log(`  Vitality: ${adventurer.stats.vitality}`);
    console.log(`  Intelligence: ${adventurer.stats.intelligence}`);
    console.log(`  Wisdom: ${adventurer.stats.wisdom}`);
    console.log(`  Charisma: ${adventurer.stats.charisma}`);
    console.log(`  Luck: ${adventurer.stats.luck || 0}`);
    
    console.log('\n🎒 Equipment:');
    if (equipmentWithXP?.weapon && equipmentWithXP.weapon.id > 0) {
      console.log(`  Weapon: ${getItemName(equipmentWithXP.weapon.id)} (ID: ${equipmentWithXP.weapon.id}, XP: ${equipmentWithXP.weapon.xp || 0})`);
    } else {
      console.log('  Weapon: None');
    }
    
    if (equipmentWithXP?.chest && equipmentWithXP.chest.id > 0) {
      console.log(`  Chest: ${getItemName(equipmentWithXP.chest.id)} (ID: ${equipmentWithXP.chest.id}, XP: ${equipmentWithXP.chest.xp || 0})`);
    } else {
      console.log('  Chest: None');
    }
    
    if (equipmentWithXP?.head && equipmentWithXP.head.id > 0) {
      console.log(`  Head: ${getItemName(equipmentWithXP.head.id)} (ID: ${equipmentWithXP.head.id}, XP: ${equipmentWithXP.head.xp || 0})`);
    } else {
      console.log('  Head: None');
    }
    
    if (equipmentWithXP?.waist && equipmentWithXP.waist.id > 0) {
      console.log(`  Waist: ${getItemName(equipmentWithXP.waist.id)} (ID: ${equipmentWithXP.waist.id}, XP: ${equipmentWithXP.waist.xp || 0})`);
    } else {
      console.log('  Waist: None');
    }
    
    if (equipmentWithXP?.foot && equipmentWithXP.foot.id > 0) {
      console.log(`  Foot: ${getItemName(equipmentWithXP.foot.id)} (ID: ${equipmentWithXP.foot.id}, XP: ${equipmentWithXP.foot.xp || 0})`);
    } else {
      console.log('  Foot: None');
    }
    
    if (equipmentWithXP?.hand && equipmentWithXP.hand.id > 0) {
      console.log(`  Hand: ${getItemName(equipmentWithXP.hand.id)} (ID: ${equipmentWithXP.hand.id}, XP: ${equipmentWithXP.hand.xp || 0})`);
    } else {
      console.log('  Hand: None');
    }
    
    if (equipmentWithXP?.neck && equipmentWithXP.neck.id > 0) {
      console.log(`  Neck: ${getItemName(equipmentWithXP.neck.id)} (ID: ${equipmentWithXP.neck.id}, XP: ${equipmentWithXP.neck.xp || 0})`);
    } else {
      console.log('  Neck: None');
    }
    
    if (equipmentWithXP?.ring && equipmentWithXP.ring.id > 0) {
      console.log(`  Ring: ${getItemName(equipmentWithXP.ring.id)} (ID: ${equipmentWithXP.ring.id}, XP: ${equipmentWithXP.ring.xp || 0})`);
    } else {
      console.log('  Ring: None');
    }
    
    // Debug: Show raw equipment data
    console.log('\n🔍 Debug - Raw Equipment Data:');
    console.log(JSON.stringify(equipmentWithXP, null, 2));
    
    if (adventurer.beast) {
      console.log('\n🐉 Beast:');
      console.log(`  ID: ${adventurer.beast.id}`);
      console.log(`  Name: ${adventurer.beast.name}`);
      console.log(`  Tier: ${adventurer.beast.tier}`);
    } else {
      console.log('\n🐉 Beast: None (not in battle)');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main
const gameId = process.argv[2] || '133595';
console.log('🚀 Starting Felt252 Decode Test...\n');
testDecode(gameId).then(() => {
  process.exit(0);
});

