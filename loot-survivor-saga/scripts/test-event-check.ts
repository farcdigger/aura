// scripts/test-event-check.ts
// Test script to check what event we're fetching and if it's a death scene

import { fetchGameData } from '../src/lib/blockchain/bibliotheca';

async function test() {
  console.log('🔍 Testing Event Check - Is it a death scene?\n');

  // Test Game ID (Değiştir - gerçek bir Game ID koy)
  const testGameId = process.argv[2] || '133595'; // Default test ID

  try {
    console.log(`📡 Fetching game data for: ${testGameId}`);
    const data = await fetchGameData(testGameId);

    console.log('\n✅ Game Data Fetched:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Adventurer ID: ${data.adventurer.id}`);
    console.log(`Health: ${data.adventurer.health}`);
    console.log(`Level: ${data.adventurer.level}`);
    console.log(`XP: ${data.adventurer.xp}`);
    console.log(`Gold: ${data.adventurer.gold}`);
    console.log(`Action Count: ${(data.adventurer as any).rawUnpackedData?.action_count || 'N/A'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Ölüm kontrolü
    const isDead = data.adventurer.health === 0;
    console.log(`\n💀 Death Status: ${isDead ? '✅ DEAD (Health = 0)' : '❌ ALIVE (Health > 0)'}`);

    // Event kontrolü
    console.log(`\n📋 Events Found: ${data.logs.length}`);
    
    if (data.logs.length > 0) {
      const lastEvent = data.logs[data.logs.length - 1];
      console.log('\n🎯 Last Event (Most Recent):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Event Type: ${lastEvent.eventType}`);
      console.log(`Turn Number: ${lastEvent.turnNumber}`);
      console.log(`Timestamp: ${lastEvent.timestamp}`);
      console.log(`Data:`, JSON.stringify(lastEvent.data, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Event tipine göre analiz
      if (lastEvent.eventType === 'Flee') {
        console.log('\n🏃 Event Analysis: FLEE event detected');
        console.log('   This could be the final action before death or escape.');
      } else if (lastEvent.eventType === 'BeastAttack') {
        console.log('\n🐉 Event Analysis: BEAST ATTACK event detected');
        console.log('   This could be the final blow that killed the adventurer.');
      } else if (lastEvent.eventType === 'Attack') {
        console.log('\n⚔️ Event Analysis: ATTACK event detected');
        console.log('   This is the adventurer attacking a beast.');
      } else if (lastEvent.eventType === 'Discovered') {
        console.log('\n🔍 Event Analysis: DISCOVERY event detected');
        console.log('   This is a discovery event.');
      } else if (lastEvent.eventType === 'Ambush') {
        console.log('\n🎯 Event Analysis: AMBUSH event detected');
        console.log('   This is an ambush event.');
      }

      // Ölüm + Event kombinasyonu
      if (isDead && data.logs.length > 0) {
        console.log('\n✅ CONCLUSION: This appears to be a DEATH SCENE!');
        console.log('   - Health = 0 (Dead)');
        console.log(`   - Last Event: ${lastEvent.eventType} at Turn ${lastEvent.turnNumber}`);
        console.log('   ✅ Ready for comic book generation!');
      } else if (!isDead && data.logs.length > 0) {
        console.log('\n⚠️ CONCLUSION: Adventurer is ALIVE but has events');
        console.log('   - Health > 0 (Alive)');
        console.log(`   - Last Event: ${lastEvent.eventType} at Turn ${lastEvent.turnNumber}`);
        console.log('   ⚠️ This is NOT a death scene, but we can still generate a comic!');
      } else if (isDead && data.logs.length === 0) {
        console.log('\n⚠️ CONCLUSION: Adventurer is DEAD but NO EVENTS found');
        console.log('   - Health = 0 (Dead)');
        console.log('   - No events available');
        console.log('   ⚠️ We can generate a comic from adventurer data only (fallback mode)');
      }
    } else {
      console.log('\n⚠️ No events found!');
      if (isDead) {
        console.log('   - Health = 0 (Dead)');
        console.log('   - No events available');
        console.log('   ⚠️ We can generate a comic from adventurer data only (fallback mode)');
      } else {
        console.log('   - Health > 0 (Alive)');
        console.log('   - No events available');
        console.log('   ⚠️ We can generate a comic from adventurer data only (fallback mode)');
      }
    }

    // Tüm event'leri listele
    if (data.logs.length > 0) {
      console.log('\n📜 All Events:');
      data.logs.forEach((log, i) => {
        console.log(`  ${i + 1}. Turn ${log.turnNumber}: ${log.eventType}`);
      });
    }

    console.log('\n✅ Test completed!');
    return { isDead, eventCount: data.logs.length, lastEvent: data.logs[data.logs.length - 1] || null, adventurer: data.adventurer };
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

test();




