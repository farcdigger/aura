// scripts/test-story.ts
// Test script for story generation

import { generateStory } from '../src/lib/ai/story-generator';
import { fetchGameData } from '../src/lib/blockchain/bibliotheca';

async function test() {
  const gameId = process.argv[2];

  if (!gameId || gameId === '0x123...') {
    console.log('❌ Lütfen gerçek bir Game ID girin:');
    console.log('   npm run test:story <GAME_ID>');
    console.log('\nÖrnek: npm run test:story 0xabcd...');
    process.exit(1);
  }

  try {
    console.log('📡 Fetching game data...');
    const gameData = await fetchGameData(gameId);

    console.log(`\n✅ Game data fetched:`);
    console.log(`   Adventurer: ${gameData.adventurer.name || 'Unnamed'}`);
    console.log(`   Level: ${gameData.adventurer.level}`);
    console.log(`   Total Events: ${gameData.logs.length}`);

    console.log('\n🧠 Generating story with Daydreams GPT-4o...');
    const story = await generateStory(gameData.adventurer, gameData.logs);

    console.log('\n✅ Story generated!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Title: ${story.title}`);
    console.log(`Theme: ${story.theme}`);
    console.log(`Total Panels: ${story.totalPanels}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n📋 First 3 panels:');
    story.panels.slice(0, 3).forEach((panel, i) => {
      console.log(`\nPanel ${panel.panelNumber}:`);
      console.log(`  Narration: ${panel.narration}`);
      console.log(`  Scene: ${panel.sceneType} (${panel.mood})`);
      console.log(`  Image Prompt: ${panel.imagePrompt.substring(0, 80)}...`);
    });

    console.log('\n✅ Test passed!');
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

test();








