// src/lib/ai/story-generator.ts

import axios from 'axios';
import type { AdventurerData, GameLog } from '../types/game';
import type { GeneratedStory, StoryPanel } from '../types/saga';

const DAYDREAMS_API_URL = 'https://api-beta.daydreams.systems/v1/chat/completions';
const INFERENCE_API_KEY = process.env.INFERENCE_API_KEY!;

if (!INFERENCE_API_KEY) {
  throw new Error('INFERENCE_API_KEY is not set in environment variables');
}

/**
 * Oyun verilerinden comic hikayesi üretir
 */
export async function generateStory(
  adventurer: AdventurerData,
  logs: GameLog[]
): Promise<GeneratedStory> {
  
  // Panel sayısını belirle (Sabit 20 sahne)
  const totalTurns = logs.length;
  const targetPanels = 20; // Her zaman 20 sahne
  
  // Önemli olayları belirle
  const keyMoments = identifyKeyMoments(logs, targetPanels);
  
  const systemPrompt = `You are a famous comic book artist for the Loot Survivor universe! Your task is to tell epic stories of adventurers in black and white, charcoal drawing style comic book format.

STYLE RULES:
- Black and white, charcoal/pen and ink drawing (line art)
- Classic comic book style (dynamic action, motion lines, speed effects)
- Detailed linework, hatching, crosshatching techniques
- Dramatic shadows and high contrast
- Action-packed scenes with monsters, weapons, battles
- Second person narrative ("You...", "Your...")

COMIC PAGE STRUCTURE:
- Generate exactly 20 scenes (panels)
- Divide these 20 scenes into 4-5 comic pages (each page contains 4-5 panels)
- Each page should be a comic book page (grid layout: 2x2 or 2x3)

PANEL STRUCTURE:
For each panel, specify:
1. SpeechBubble: Character's dialogue or narration (Max 100 characters, English)
2. Image Prompt: Detailed visual description in black and white charcoal style (English, optimized for FLUX, NO speech bubbles in image, black and white, pen and ink, dynamic action)
3. Scene Type: battle/discovery/upgrade/death/victory/rest
4. Mood: dramatic/intense/serious/mysterious/tense

IMPORTANT: 
- Images must show ACTION: monsters, swords, battles, weapons, combat
- NO speech bubbles in the images - text will be shown below
- Black and white, charcoal drawing style
- Dynamic poses, motion lines, speed effects
- Each page should contain 4-5 panels (grid layout: 2x2 or 2x3)

EXAMPLE PANEL:
{
  "speechBubble": "In the depths of the dark dungeon, you face the commander of the skeleton army.",
  "imagePrompt": "Black and white charcoal drawing, dynamic action scene, brave adventurer wielding sword in combat against skeleton warrior commander in dark dungeon, detailed linework, hatching and crosshatching, dramatic shadows, motion lines, speed effects, classic comic book style, monochrome, no colors, no speech bubbles",
  "sceneType": "battle",
  "mood": "dramatic"
}`;

  // Equipment names helper
  const { getItemName } = await import('../blockchain/loot-items');
  
  const getEquipmentName = (item: { id: number; name?: string; type?: string } | null) => {
    return item ? getItemName(item.id) : null;
  };
  
  const equipmentList = [
    adventurer.equipment.weapon ? `Weapon: ${getEquipmentName(adventurer.equipment.weapon)}` : null,
    adventurer.equipment.chest ? `Chest: ${getEquipmentName(adventurer.equipment.chest)}` : null,
    adventurer.equipment.head ? `Head: ${getEquipmentName(adventurer.equipment.head)}` : null,
    adventurer.equipment.waist ? `Waist: ${getEquipmentName(adventurer.equipment.waist)}` : null,
    adventurer.equipment.foot ? `Foot: ${getEquipmentName(adventurer.equipment.foot)}` : null,
    adventurer.equipment.hand ? `Hand: ${getEquipmentName(adventurer.equipment.hand)}` : null,
    adventurer.equipment.neck ? `Neck: ${getEquipmentName(adventurer.equipment.neck)}` : null,
    adventurer.equipment.ring ? `Ring: ${getEquipmentName(adventurer.equipment.ring)}` : null,
  ].filter(Boolean).join(', ');
  
  // Equipment names for prompt (without XP)
  const weaponName = getEquipmentName(adventurer.equipment.weapon) || 'sword';
  const chestName = getEquipmentName(adventurer.equipment.chest) || 'armor';

  const userPrompt = `Game Data:
Adventurer: ${adventurer.name || 'Unnamed Hero'}
Level: ${adventurer.level}
XP: ${adventurer.xp}
Health: ${adventurer.health}/${adventurer.level * 10} (${adventurer.health === 0 ? 'DEAD' : 'ALIVE'})
Gold: ${adventurer.gold}
Total Turns: ${totalTurns}
Result: ${adventurer.health === 0 ? 'Died' : 'Survived'}

Character Stats:
- Strength: ${adventurer.stats.strength}
- Dexterity: ${adventurer.stats.dexterity}
- Vitality: ${adventurer.stats.vitality}
- Intelligence: ${adventurer.stats.intelligence}
- Wisdom: ${adventurer.stats.wisdom}
- Charisma: ${adventurer.stats.charisma}

Equipment:
${equipmentList || 'No equipment'}

${keyMoments.length > 0 ? `Key Events:\n${keyMoments.map((m: any, i: number) => `${i + 1}. Turn ${m.turnNumber}: ${m.description}`).join('\n')}` : 'No specific events logged - create a general adventure story based on the character stats and equipment.'}

TASK: Using this SPECIFIC game data, create an epic comic book story with exactly 20 panels that reflects:
- The character's equipment (show the specific weapons and armor in scenes)
- The character's stats (strength affects combat, dexterity affects agility, etc.)
- The actual game events (battles, discoveries, upgrades, death)
- The character's journey from start to ${adventurer.health === 0 ? 'death' : 'survival'}

CRITICAL REQUIREMENTS FOR EACH PANEL (MANDATORY - NO EXCEPTIONS):
- Generate exactly 20 COMPLETELY UNIQUE panels - EACH panel MUST show a DIFFERENT scene, DIFFERENT monster, DIFFERENT action, DIFFERENT location
- NO REPEATED SCENES - If you repeat a scene, the entire generation will be rejected
- Each panel MUST have a speechBubble! Characters should speak or have inner monologue.
- Group panels logically by story flow (each group will be a comic page with 4 panels)
- Image prompts must be EXTREMELY DETAILED and HIGHLY SPECIFIC:
  * ALWAYS show the character's ACTUAL EQUIPMENT in EVERY panel: ${equipmentList || 'weapons and armor'}
  * ALWAYS show SPECIFIC monsters/creatures - EACH panel must have a DIFFERENT monster type:
    - Panel 1: skeleton warrior with rusty sword
    - Panel 2: giant beast with claws and fangs
    - Panel 3: dragon breathing fire
    - Panel 4: goblin horde with daggers
    - Panel 5: orc warrior with battle axe
    - Panel 6: ghost with ethereal form
    - Panel 7: demon with horns
    - Panel 8: troll with club
    - Panel 9: wraith with shadow powers
    - Panel 10: necromancer casting spells
    - ... (EACH panel MUST have a DIFFERENT monster/enemy)
  * ALWAYS show SPECIFIC actions - EACH panel must have a DIFFERENT action:
    - Panel 1: powerful sword strike
    - Panel 2: agile dodge and counter
    - Panel 3: blocking attack with shield
    - Panel 4: casting fire spell
    - Panel 5: discovering treasure chest
    - Panel 6: level up moment with glowing aura
    - Panel 7: healing potion consumption
    - Panel 8: critical hit execution
    - Panel 9: fleeing from overwhelming enemy
    - Panel 10: final boss confrontation
    - ... (EACH panel MUST have a DIFFERENT action)
  * ALWAYS show SPECIFIC locations - EACH panel must have a DIFFERENT location:
    - Panel 1: dark dungeon with stone walls and torches
    - Panel 2: ancient cave with stalactites and glowing crystals
    - Panel 3: deep forest with tall trees and shadows
    - Panel 4: ruined temple with broken columns
    - Panel 5: underground crypt with coffins
    - Panel 6: castle courtyard with battlements
    - Panel 7: swamp with murky water
    - Panel 8: mountain pass with cliffs
    - Panel 9: abandoned mine with tunnels
    - Panel 10: boss chamber with throne
    - ... (EACH panel MUST have a DIFFERENT location)
  * Character's stats MUST affect scenes:
    - Strength ${adventurer.stats.strength}: ${adventurer.stats.strength > 15 ? 'powerful strikes, heavy weapons, crushing blows' : 'moderate combat, standard attacks'}
    - Dexterity ${adventurer.stats.dexterity}: ${adventurer.stats.dexterity > 15 ? 'agile movements, acrobatic dodges, swift strikes' : 'standard agility, normal movement'}
    - Vitality ${adventurer.stats.vitality}: ${adventurer.stats.vitality > 25 ? 'enduring warrior, taking hits, standing strong' : 'average endurance, struggling'}
    - Intelligence ${adventurer.stats.intelligence}: ${adventurer.stats.intelligence > 5 ? 'casting spells, magical attacks, strategic thinking' : 'melee combat only'}
- EACH PANEL MUST BE VISUALLY DISTINCT - Different composition, different angle, different perspective
- NO speech bubbles in images - text will be displayed below
- Use dynamic poses, motion lines, speed effects, action lines for EVERY action scene
- Classic comic book style: dramatic shadows, high contrast, detailed linework

Return in JSON format:
{
  "title": "Story title (epic and dramatic)",
  "theme": "Story theme",
  "panels": [
    {
      "panelNumber": 1,
      "speechBubble": "Dialogue or narration text (Max 100 characters, English)",
      "imagePrompt": "Black and white charcoal drawing, comic book panel, [PANEL 1 - MUST BE UNIQUE FROM ALL OTHER PANELS] adventurer (Strength ${adventurer.stats.strength}, Dexterity ${adventurer.stats.dexterity}, Vitality ${adventurer.stats.vitality}) wielding ${weaponName}, wearing ${chestName}, ${getEquipmentName(adventurer.equipment.head) || 'helmet'}, ${getEquipmentName(adventurer.equipment.hand) || 'gloves'}, ${getEquipmentName(adventurer.equipment.foot) || 'boots'}, fighting [UNIQUE MONSTER FOR THIS PANEL - DIFFERENT FROM ALL OTHER PANELS: skeleton warrior with rusty sword OR giant beast with claws OR dragon breathing fire OR goblin with dagger OR orc with axe OR ghost with ethereal form OR demon with horns OR troll with club OR wraith with shadow powers OR necromancer casting spells], [UNIQUE ACTION FOR THIS PANEL - DIFFERENT FROM ALL OTHER PANELS: ${adventurer.stats.strength > 15 ? 'powerful sword strike with motion lines' : 'sword clash with impact sparks'}, ${adventurer.stats.dexterity > 15 ? 'agile dodge with speed lines' : 'blocking attack with shield'}, ${adventurer.stats.intelligence > 5 ? 'casting fire spell with magical energy' : 'melee combat with weapon'}, discovering treasure, level up with glowing aura, healing with potion, critical hit, fleeing, boss battle], in [UNIQUE LOCATION FOR THIS PANEL - DIFFERENT FROM ALL OTHER PANELS: dark dungeon with stone walls and torches OR ancient cave with stalactites and glowing crystals OR deep forest with tall trees and shadows OR ruined temple with broken columns OR underground crypt with coffins OR castle courtyard with battlements OR swamp with murky water OR mountain pass with cliffs OR abandoned mine with tunnels OR boss chamber with throne], dynamic action scene, motion lines, speed effects, dramatic shadows, high contrast, detailed linework, hatching and crosshatching, classic comic book style, monochrome, no colors, no speech bubbles, professional comic book illustration",
      "sceneType": "battle",
      "mood": "dramatic"
    }
    // ... total 20 panels - EACH MUST BE UNIQUE with different scenes, monsters, actions, locations
  ]
}

EXAMPLE OF UNIQUE PANELS (each must be DIFFERENT):
- Panel 1: Adventurer entering dark dungeon with ${weaponName} drawn, wearing ${chestName}
- Panel 2: Battle against skeleton warrior with ${weaponName}, ${adventurer.stats.strength > 15 ? 'powerful strike' : 'sword clash'}
- Panel 3: Discovering treasure chest in ancient ruins, ${adventurer.stats.dexterity > 15 ? 'agile movement' : 'cautious approach'}
- Panel 4: Facing a dragon/beast in a cave, ${adventurer.stats.vitality > 25 ? 'enduring warrior' : 'struggling fighter'}
- Panel 5: Level up moment, gaining power, glowing aura
- Panel 6: Different monster (goblin/orc/ghost), different location (forest/swamp/castle)
- ... (each panel must be UNIQUE with different scenes, monsters, actions, locations)

IMPORTANT: Each panel MUST have a speechBubble! Characters should speak or have inner monologue. Image prompts must show ACTION and DETAILS.`;

  try {
    // Daydreams API üzerinden GPT-4o çağrısı
    const response = await axios.post(
      DAYDREAMS_API_URL,
      {
        model: 'openai/gpt-4o', // Daydreams model formatı
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
        max_tokens: 4000
      },
      {
        headers: {
          Authorization: `Bearer ${INFERENCE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 saniye timeout
      }
    );

    const content = response.data.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Validation
    if (!parsed.title || !parsed.panels || !Array.isArray(parsed.panels)) {
      throw new Error('Invalid story format returned from AI');
    }

    const panels = parsed.panels.map((p: any, i: number) => {
      // Her panel prompt'una equipment ve stats bilgilerini ekle (eğer yoksa)
      let enhancedPrompt = p.imagePrompt || '';
      
      // Eğer prompt'ta equipment bilgisi yoksa ekle
      if (enhancedPrompt && !enhancedPrompt.includes(weaponName) && !enhancedPrompt.includes('sword') && !enhancedPrompt.includes('weapon')) {
        enhancedPrompt = enhancedPrompt.replace(
          /adventurer/gi,
          `adventurer wielding ${weaponName}, wearing ${chestName}`
        );
      }
      
      return {
        panelNumber: p.panelNumber || i + 1,
        speechBubble: p.speechBubble || p.narration || '', // Backward compatibility
        narration: p.speechBubble || p.narration || '', // Keep narration for backward compatibility
        imagePrompt: enhancedPrompt,
        sceneType: p.sceneType || 'battle',
        mood: p.mood || 'dramatic'
      };
    });

    // Panelleri comic sayfalarına böl (her sayfa 4 panel)
    const panelsPerPage = 4; // Her sayfada 4 panel (2x2 grid)
    const pages: Array<{ pageNumber: number; panels: typeof panels; pageDescription?: string }> = [];
    
    for (let i = 0; i < panels.length; i += panelsPerPage) {
      const pagePanels = panels.slice(i, i + panelsPerPage);
      const pageNumber = Math.floor(i / panelsPerPage) + 1;
      
      // Her sayfa için detaylı açıklama oluştur (4 panelin özeti)
      const pageDescription = `Page ${pageNumber}: ${pagePanels.map((p: StoryPanel, idx: number) => {
        const panelNum = (pageNumber - 1) * 4 + idx + 1;
        // Speech bubble'dan veya scene type'dan açıklama çıkar
        let desc = '';
        if (p.speechBubble) {
          // İlk 50 karakteri al
          desc = p.speechBubble.substring(0, 50).replace(/["']/g, '');
        } else {
          desc = p.sceneType === 'battle' ? 'battle scene' : 
                 p.sceneType === 'discovery' ? 'discovery' : 
                 p.sceneType === 'death' ? 'final moments' : 
                 p.sceneType === 'victory' ? 'victory' : 'adventure';
        }
        return `Panel ${panelNum}: ${desc}`;
      }).join(' | ')}`;
      
      pages.push({
        pageNumber,
        panels: pagePanels,
        pageDescription
      });
    }

    return {
      title: parsed.title,
      theme: parsed.theme || 'Epic Adventure',
      panels, // Tüm paneller (backward compatibility)
      pages, // Comic sayfaları
      totalPanels: panels.length,
      totalPages: pages.length
    };

  } catch (error: any) {
    console.error('Story generation error:', error);
    
    if (error.response?.status === 402) {
      throw new Error('Daydreams account balance insufficient. Please add funds at https://daydreams.systems');
    }
    
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    throw new Error(`Failed to generate story: ${error.message}`);
  }
}

/**
 * Oyun loglarından önemli anları seçer
 */
function identifyKeyMoments(logs: GameLog[], targetCount: number): Array<{
  turnNumber: number;
  description: string;
  importance: number;
}> {
  const moments = logs.map((log: GameLog, index: number) => {
    let importance = 1;
    let description = '';

    switch (log.eventType) {
      case 'Attack':
        const damage = log.data.damage || 0;
        if (log.data.criticalHit) {
          importance = 5;
          description = `Critical hit! You dealt ${damage} damage.`;
        } else if (damage > 20) {
          importance = 3;
          description = `Strong attack: ${damage} damage.`;
        } else {
          importance = 1;
          description = `Attack: ${damage} damage.`;
        }
        break;

      case 'Flee':
        importance = 4;
        description = 'You fled from battle.';
        break;

      case 'Discovered':
        if (log.data.discoveryType === 'Beast' || log.data.entityName) {
          importance = 4;
          description = `Encountered ${log.data.entityName || 'a monster'}!`;
        } else {
          importance = 2;
          description = `Discovered ${log.data.entityName || 'something'}.`;
        }
        break;

      case 'Upgraded':
        importance = 3;
        description = 'Level up!';
        break;

      case 'Died':
        importance = 10;
        description = 'Death...';
        break;

      default:
        importance = 1;
        description = `${log.eventType} event occurred.`;
    }

    return {
      turnNumber: log.turnNumber,
      description,
      importance
    };
  });

  // Önem sırasına göre sırala ve hedef sayı kadar al
  return moments
    .sort((a, b) => b.importance - a.importance)
    .slice(0, targetCount)
    .sort((a, b) => a.turnNumber - b.turnNumber);
}

