// src/lib/ai/scene-extractor.ts
// Verilerden 20 sahne çıkarır ve 4'lü gruplara böler

import type { AdventurerData, GameLog } from '@/types/game';
import { getItemName } from '@/lib/blockchain/loot-items';

export interface GameScene {
  panelNumber: number;
  turnNumber: number;
  sceneType: 'battle' | 'discovery' | 'upgrade' | 'death' | 'victory' | 'rest';
  monster?: string; // Monster name (entityName veya beast name)
  action: string; // Specific action description
  location: string; // Inferred location
  equipment: AdventurerData['equipment']; // Equipment snapshot at this turn
  stats: AdventurerData['stats']; // Stats at this turn (may evolve)
  description: string; // Full scene description for prompt
  speechBubble: string; // Character dialogue/narration
}

export interface ComicPage {
  pageNumber: number;
  scenes: GameScene[];
  pageDescription: string; // Summary of the 4 scenes
  imagePrompt: string; // Combined prompt for Replicate
}

/**
 * Verilerden 20 önemli sahne çıkarır
 * PROTOTYPE MODE: 1 event varsa, son 2 sahne o event'ten oluşturulur
 */
export function extractScenes(
  adventurer: AdventurerData,
  logs: GameLog[],
  totalTurns: number
): GameScene[] {
  const scenes: GameScene[] = [];
  const targetScenes = 20;
  
  // PROTOTYPE MODE: 1 event varsa, özel işlem
  if (logs.length === 1) {
    console.log('[Scene Extractor] 🎯 PROTOTYPE MODE: 1 event found, creating 18 scenes from adventurer + 2 scenes from event');
    
    // İlk 18 sahneyi adventurer data'sından oluştur
    const adventurerScenes = generateScenesFromAdventurer(adventurer, 18);
    scenes.push(...adventurerScenes);
    
    // Son 2 sahneyi (19 ve 20) event'ten oluştur
    const lastEvent = logs[0];
    const importantMoments = identifyImportantMoments(logs, adventurer);
    
    if (importantMoments.length > 0) {
      const moment = importantMoments[0];
      
      // Panel 19: Event'in ilk anı (örneğin kaçış başlangıcı)
      const scene19 = createSceneFromEvent(moment, adventurer, 19, 'before');
      scenes.push(scene19);
      
      // Panel 20: Event'in sonucu (ölüm veya kaçış sonucu)
      if (adventurer.health === 0) {
        // Ölüm sahnesi
        scenes.push(createDeathScene(adventurer, 20));
      } else {
        // Event'in sonucu (kaçış başarılı vs)
        const scene20 = createSceneFromEvent(moment, adventurer, 20, 'after');
        scenes.push(scene20);
      }
    } else {
      // Event'ten sahne oluşturulamazsa, normal sahne oluştur
      const scene19 = createSceneFromEvent({ log: lastEvent, importance: 10, type: 'flee' }, adventurer, 19, 'before');
      scenes.push(scene19);
      scenes.push(createDeathScene(adventurer, 20));
    }
  } else if (logs.length > 1) {
    // Birden fazla event varsa, normal işlem
    const importantMoments = identifyImportantMoments(logs, adventurer);
    const selectedMoments = selectKeyMoments(importantMoments, targetScenes, totalTurns);
    
    for (let i = 0; i < selectedMoments.length; i++) {
      const moment = selectedMoments[i];
      const scene = createScene(moment, adventurer, i + 1);
      scenes.push(scene);
    }
  } else {
    // Logs yoksa, adventurer data'sından sahneler oluştur
    console.log('[Scene Extractor] No logs available, generating scenes from adventurer data');
    scenes.push(...generateScenesFromAdventurer(adventurer, targetScenes));
  }
  
  // Son sahne mutlaka ölüm/victory olmalı (eğer zaten ayarlanmadıysa)
  if (adventurer.health === 0 && scenes[scenes.length - 1].sceneType !== 'death') {
    scenes[scenes.length - 1] = createDeathScene(adventurer, scenes.length);
  } else if (adventurer.health > 0 && scenes[scenes.length - 1].sceneType !== 'victory') {
    scenes[scenes.length - 1] = createVictoryScene(adventurer, scenes.length);
  }
  
  return scenes;
}

/**
 * Event'ten sahne oluştur (PROTOTYPE MODE için - before/after varyasyonları)
 */
function createSceneFromEvent(
  moment: { log: GameLog; importance: number; type: string },
  adventurer: AdventurerData,
  panelNumber: number,
  timing: 'before' | 'after'
): GameScene {
  const { log } = moment;
  
  let action = '';
  let speechBubble = '';
  let sceneType: GameScene['sceneType'] = 'battle';
  
  if (log.eventType === 'Flee') {
    if (timing === 'before') {
      action = 'Attempting to flee from battle';
      speechBubble = 'I must escape! This is too dangerous!';
      sceneType = 'rest';
    } else {
      action = 'Flee attempt - final outcome';
      speechBubble = adventurer.health === 0 ? 'I failed to escape...' : 'I managed to escape!';
      sceneType = adventurer.health === 0 ? 'death' : 'rest';
    }
  } else if (log.eventType === 'BeastAttack') {
    if (timing === 'before') {
      action = `Beast attacks! ${log.data.damage || 0} damage incoming`;
      speechBubble = 'The beast strikes!';
      sceneType = 'battle';
    } else {
      action = 'After the beast attack';
      speechBubble = adventurer.health === 0 ? 'This was the final blow...' : 'I survived the attack!';
      sceneType = adventurer.health === 0 ? 'death' : 'battle';
    }
  } else if (log.eventType === 'Attack') {
    if (timing === 'before') {
      action = `Attacking with ${log.data.damage || 0} damage`;
      speechBubble = 'Take this!';
      sceneType = 'battle';
    } else {
      action = 'After the attack';
      speechBubble = 'The battle continues...';
      sceneType = 'battle';
    }
  } else {
    // Diğer event tipleri için
    action = `${log.eventType} event`;
    speechBubble = 'Something happened...';
    sceneType = 'battle';
  }
  
  const location = log.data.locationName || inferLocation(log.turnNumber, adventurer.level);
  const description = generateSceneDescription(log, undefined, action, location, adventurer);
  
  return {
    panelNumber,
    turnNumber: log.turnNumber,
    sceneType,
    monster: log.data.beastName || undefined,
    action,
    location,
    equipment: adventurer.equipment,
    stats: adventurer.stats,
    description,
    speechBubble
  };
}

/**
 * Adventurer data'sından sahneler oluştur (logs yoksa)
 * GERÇEK VERİLERİ KULLANARAK: equipment, stats, level, xp, gold, health
 */
function generateScenesFromAdventurer(adventurer: AdventurerData, targetScenes: number): GameScene[] {
  const scenes: GameScene[] = [];
  
  // Gerçek veriler
  const weaponName = getItemName(adventurer.equipment.weapon?.id || 0);
  const chestName = getItemName(adventurer.equipment.chest?.id || 0);
  const headName = getItemName(adventurer.equipment.head?.id || 0);
  const { strength, dexterity, vitality, intelligence, wisdom, charisma } = adventurer.stats;
  const level = adventurer.level;
  const xp = adventurer.xp;
  const gold = adventurer.gold;
  const health = adventurer.health;
  const maxHealth = level * 10;
  
  // Estimated turns (XP'den tahmin)
  const estimatedTurns = Math.max(100, Math.floor(xp / 10));
  const turnStep = Math.floor(estimatedTurns / targetScenes);
  
  // Monster progression (level'e göre)
  const getMonsterForLevel = (currentLevel: number, index: number): string => {
    if (currentLevel < 5) return ['Skeleton Warrior', 'Goblin', 'Zombie', 'Rat'][index % 4] || 'Skeleton Warrior';
    if (currentLevel < 10) return ['Orc', 'Troll', 'Giant Spider', 'Dark Knight'][index % 4] || 'Orc';
    if (currentLevel < 20) return ['Dragon', 'Demon', 'Lich', 'Beast'][index % 4] || 'Dragon';
    if (currentLevel < 30) return ['Ancient Dragon', 'Archdemon', 'Death Knight', 'Shadow Beast'][index % 4] || 'Ancient Dragon';
    return ['Final Boss', 'Elder Dragon', 'Dark Lord', 'Ultimate Beast'][index % 4] || 'Final Boss';
  };
  
  for (let i = 0; i < targetScenes; i++) {
    const turnNumber = (i + 1) * turnStep;
    const progress = (i + 1) / targetScenes;
    const currentLevel = Math.max(1, Math.floor(level * progress));
    
    let sceneType: GameScene['sceneType'] = 'battle';
    let monster = getMonsterForLevel(currentLevel, i);
    let action = '';
    let speechBubble = '';
    
    // İlk sahne: Başlangıç (equipment ile)
    if (i === 0) {
      sceneType = 'discovery';
      monster = 'Skeleton Warrior';
      action = `Entering the dungeon with ${weaponName}`;
      speechBubble = `Armed with ${weaponName}, wearing ${chestName}, the adventure begins...`;
    }
    // Level up sahneleri (her 5 level'de bir)
    else if (i > 0 && i < targetScenes - 2 && currentLevel % 5 === 0 && i % 3 === 0) {
      sceneType = 'upgrade';
      monster = undefined;
      action = `Level up! Reached level ${currentLevel}`;
      speechBubble = `Level ${currentLevel}! New powers awaken!`;
    }
    // Treasure discovery (gold'a göre)
    else if (i > 0 && i < targetScenes - 2 && gold > 0 && i % 4 === 0) {
      sceneType = 'discovery';
      monster = undefined;
      action = `Discovering treasure chest with ${gold} gold`;
      speechBubble = `Treasure found! ${gold} gold coins!`;
    }
    // Savaş sahneleri (stats'a göre action belirle)
    else if (i < targetScenes - 2) {
      sceneType = 'battle';
      
      // Strength yüksekse güçlü vuruşlar
      if (strength > 20) {
        action = `Powerful ${weaponName} strike with crushing force`;
        speechBubble = `${weaponName} strikes true! ${monster} staggers!`;
      }
      // Dexterity yüksekse agile hareketler
      else if (dexterity > 20) {
        action = `Agile dodge and swift ${weaponName} counter-attack`;
        speechBubble = `Too fast! ${monster} can't keep up!`;
      }
      // Intelligence yüksekse spell casting
      else if (intelligence > 10) {
        action = `Casting magical spell while wielding ${weaponName}`;
        speechBubble = `Magic flows through ${weaponName}!`;
      }
      // Vitality yüksekse tanking
      else if (vitality > 25) {
        action = `Blocking attack with ${chestName}, then countering with ${weaponName}`;
        speechBubble = `${chestName} protects! ${weaponName} strikes back!`;
      }
      // Normal combat
      else {
        action = `Combat with ${weaponName} against ${monster}`;
        speechBubble = `Fighting ${monster} with ${weaponName}!`;
      }
    }
    // Son ikinci sahne: Boss fight
    else if (i === targetScenes - 2) {
      sceneType = 'battle';
      monster = level > 30 ? 'Final Boss' : level > 20 ? 'Elder Dragon' : 'Boss';
      action = `Final battle against ${monster} with ${weaponName}`;
      speechBubble = `The final confrontation! ${weaponName} ready!`;
    }
    // Son sahne: Victory/Death (override edilecek)
    else {
      sceneType = health === 0 ? 'death' : 'victory';
      monster = 'Final Boss';
      action = health === 0 ? 'Final moments' : 'Victory achieved';
      speechBubble = health === 0 ? 'This is where my journey ends...' : 'Victory! The adventure is complete!';
    }
    
    // Location (level'e göre)
    const location = inferLocation(turnNumber, currentLevel);
    
    // Description (GERÇEK EQUIPMENT VE STATS İLE)
    const weaponDesc = weaponName !== 'Unknown Item (0)' ? `wielding ${weaponName}` : 'unarmed';
    const armorDesc = chestName !== 'Unknown Item (0)' ? `wearing ${chestName}` : 'unarmored';
    const helmetDesc = headName !== 'Unknown Item (0)' ? `and ${headName}` : '';
    const statsDesc = `Strength ${strength}, Dexterity ${dexterity}, Vitality ${vitality}`;
    
    const description = `Adventurer (${statsDesc}) ${weaponDesc}, ${armorDesc} ${helmetDesc}, ${action}, fighting ${monster || 'enemies'}, in ${location}, dynamic action scene, motion lines, speed effects, dramatic shadows`;
    
    scenes.push({
      panelNumber: i + 1,
      turnNumber,
      sceneType,
      monster,
      action,
      location,
      equipment: adventurer.equipment, // GERÇEK EQUIPMENT
      stats: adventurer.stats, // GERÇEK STATS
      description,
      speechBubble
    });
  }
  
  return scenes;
}

/**
 * Victory sahnesi oluştur
 */
function createVictoryScene(adventurer: AdventurerData, panelNumber: number): GameScene {
  return {
    panelNumber,
    turnNumber: 9999,
    sceneType: 'victory',
    action: 'Victory achieved',
    location: 'boss chamber with throne and light',
    equipment: adventurer.equipment,
    stats: adventurer.stats,
    description: `The hero stands victorious. Level ${adventurer.level}, ${adventurer.xp} XP, ${adventurer.gold} gold. The adventure is complete.`,
    speechBubble: 'Victory! The adventure is complete!'
  };
}

/**
 * Önemli anları belirle (critical hits, discoveries, level ups, etc.)
 */
function identifyImportantMoments(
  logs: GameLog[],
  adventurer: AdventurerData
): Array<{
  log: GameLog;
  importance: number;
  type: 'critical' | 'discovery' | 'flee' | 'high_damage' | 'death' | 'first_battle';
}> {
  const moments: Array<{
    log: GameLog;
    importance: number;
    type: string;
  }> = [];
  
  let firstBattleFound = false;
  
  for (const log of logs) {
    let importance = 1;
    let type = 'normal';
    
    if (log.eventType === 'Attack') {
      const damage = log.data.damage || 0;
      const criticalHit = log.data.criticalHit || false;
      
      if (!firstBattleFound) {
        importance = 10; // İlk savaş çok önemli
        type = 'first_battle';
        firstBattleFound = true;
      } else if (criticalHit) {
        importance = 8; // Critical hit önemli
        type = 'critical';
      } else if (damage > 30) {
        importance = 6; // Yüksek hasar önemli
        type = 'high_damage';
      } else {
        importance = 2; // Normal saldırı
      }
    } else if (log.eventType === 'Flee') {
      importance = 7; // Kaçış önemli
      type = 'flee';
    } else if (log.eventType === 'Discovered') {
      const entityName = log.data.entityName || log.data.discoveryType;
      if (entityName && entityName !== 'Unknown') {
        importance = 9; // Monster keşfi çok önemli
        type = 'discovery';
      } else {
        importance = 3; // Genel keşif
      }
    } else if (log.eventType === 'Died') {
      importance = 10; // Ölüm en önemli
      type = 'death';
    }
    
    moments.push({ log, importance, type });
  }
  
  return moments;
}

/**
 * 20 önemli anı seç
 */
function selectKeyMoments(
  moments: Array<{ log: GameLog; importance: number; type: string }>,
  targetCount: number,
  totalTurns: number
): Array<{ log: GameLog; importance: number; type: string }> {
  // Önem sırasına göre sırala
  const sorted = [...moments].sort((a, b) => b.importance - a.importance);
  
  // İlk 20'yi al
  let selected = sorted.slice(0, targetCount);
  
  // Eğer yeterli moment yoksa, turn number'a göre eşit dağıt
  if (selected.length < targetCount) {
    const step = Math.max(1, Math.floor(totalTurns / targetCount));
    const additional: Array<{ log: GameLog; importance: number; type: string }> = [];
    
    for (let i = 0; i < targetCount - selected.length; i++) {
      const targetTurn = Math.floor((i + 1) * step);
      const closestLog = moments.find(m => 
        Math.abs(m.log.turnNumber - targetTurn) < step / 2
      );
      
      if (closestLog && !selected.some(s => s.log.id === closestLog.log.id)) {
        additional.push(closestLog);
      }
    }
    
    selected = [...selected, ...additional];
  }
  
  // Turn number'a göre sırala
  selected.sort((a, b) => a.log.turnNumber - b.log.turnNumber);
  
  // Tam 20 sahne olmalı
  while (selected.length < targetCount) {
    // Eksik sahneler için genel sahneler ekle
    const lastLog = selected[selected.length - 1]?.log || null;
    const fakeLog: GameLog = {
      id: `generated-${selected.length + 1}`,
      adventurerId: lastLog?.adventurerId || '',
      eventType: 'Attack',
      timestamp: new Date().toISOString(),
      turnNumber: lastLog ? lastLog.turnNumber + 10 : selected.length * 10,
      data: { damage: 15 }
    };
    selected.push({ log: fakeLog, importance: 1, type: 'normal' });
  }
  
  return selected.slice(0, targetCount);
}

/**
 * Bir moment'ten sahne oluştur (GERÇEK EVENT DATA KULLANARAK)
 */
function createScene(
  moment: { log: GameLog; importance: number; type: string },
  adventurer: AdventurerData,
  panelNumber: number
): GameScene {
  const { log } = moment;
  
  // Monster name'i çıkar (GERÇEK EVENT DATA'DAN)
  let monster: string | undefined;
  if (log.eventType === 'Discovered' || log.eventType === 'BeastAttack') {
    // BeastEvent'ten veya önceki event'ten monster name al
    monster = log.data.entityName || log.data.discoveryType || 'Unknown Creature';
  }
  
  // Action description (GERÇEK EVENT DATA KULLANARAK)
  let action = '';
  if (log.eventType === 'Attack' || log.eventType === 'BeastAttack') {
    const damage = log.data.damage || 0;
    const critical = log.data.criticalHit || false;
    const location = log.data.locationName || `Location ${log.data.location || 'Unknown'}`;
    
    if (critical) {
      action = `Critical strike dealing ${damage} damage at ${location}`;
    } else {
      action = `Attack dealing ${damage} damage at ${location}`;
    }
  } else if (log.eventType === 'Flee') {
    action = 'Fleeing from battle';
  } else if (log.eventType === 'Discovered') {
    const entityName = log.data.entityName || 'a creature';
    const discoveryType = log.data.discoveryType;
    
    if (discoveryType === 'Beast') {
      action = `Encountering ${entityName} (Level ${log.data.beastLevel || '?'}, Health ${log.data.beastHealth || '?'})`;
    } else if (discoveryType === 'Gold') {
      action = `Discovering ${log.data.discoveryValue || 0} gold`;
    } else if (discoveryType === 'Item') {
      action = `Finding an item`;
    } else {
      action = `Discovering ${entityName}`;
    }
  } else if (log.eventType === 'Died') {
    action = 'Final moments';
  }
  
  // Location inference (context-based, ama event'te location varsa onu kullan)
  let location: string;
  if (log.data.locationName) {
    // Event'ten location name geliyorsa onu kullan
    location = `dungeon with ${log.data.locationName.toLowerCase()} impact`;
  } else {
    location = inferLocation(log.turnNumber, adventurer.level);
  }
  
  // Scene type
  let sceneType: GameScene['sceneType'] = 'battle';
  if (log.eventType === 'Discovered') {
    sceneType = 'discovery';
  } else if (log.eventType === 'Flee') {
    sceneType = 'rest';
  } else if (log.eventType === 'Died') {
    sceneType = 'death';
  } else if (log.eventType === 'Attack' || log.eventType === 'BeastAttack') {
    sceneType = 'battle';
  }
  
  // Speech bubble (GERÇEK DATA İLE)
  const speechBubble = generateSpeechBubble(log, monster, action, adventurer);
  
  // Description for prompt (GERÇEK DATA İLE DETAYLI)
  const description = generateSceneDescription(log, monster, action, location, adventurer);
  
  return {
    panelNumber,
    turnNumber: log.turnNumber,
    sceneType,
    monster,
    action,
    location,
    equipment: adventurer.equipment, // Equipment snapshot
    stats: adventurer.stats,
    description,
    speechBubble
  };
}

/**
 * Ölüm sahnesi oluştur
 */
function createDeathScene(adventurer: AdventurerData, panelNumber: number): GameScene {
  return {
    panelNumber,
    turnNumber: 9999, // Son turn
    sceneType: 'death',
    action: 'Final moments - Death',
    location: inferLocation(9999, adventurer.level),
    equipment: adventurer.equipment,
    stats: adventurer.stats,
    description: `The hero's final moments. Health reaches zero. The adventure ends.`,
    speechBubble: 'This is where my journey ends...'
  };
}

/**
 * Location inference (context-based)
 */
function inferLocation(turnNumber: number, level: number): string {
  // Level ve turn number'a göre location belirle
  if (level < 5) {
    return 'dark dungeon with stone walls and torches';
  } else if (level < 10) {
    return 'ancient cave with stalactites and glowing crystals';
  } else if (level < 15) {
    return 'deep forest with tall trees and shadows';
  } else if (level < 20) {
    return 'ruined temple with broken columns';
  } else if (level < 30) {
    return 'underground crypt with coffins';
  } else if (level < 40) {
    return 'castle courtyard with battlements';
  } else {
    return 'boss chamber with throne and dark aura';
  }
}

/**
 * Speech bubble oluştur (GERÇEK EVENT DATA İLE)
 */
function generateSpeechBubble(
  log: GameLog,
  monster: string | undefined,
  action: string,
  adventurer: AdventurerData
): string {
  if (log.eventType === 'Attack') {
    const critical = log.data.criticalHit;
    const damage = log.data.damage || 0;
    const location = log.data.locationName || 'target';
    
    if (critical) {
      return `Critical hit! ${damage} damage to ${location}! ${monster || 'The enemy'} reels!`;
    }
    return `${damage} damage! ${monster || 'The enemy'} staggers!`;
  } else if (log.eventType === 'BeastAttack') {
    const damage = log.data.damage || 0;
    return `The ${monster || 'enemy'} strikes! ${damage} damage taken!`;
  } else if (log.eventType === 'Flee') {
    return 'Retreat! I must live to fight another day!';
  } else if (log.eventType === 'Discovered') {
    if (log.data.discoveryType === 'Beast') {
      const beastLevel = log.data.beastLevel || '?';
      return `${monster || 'A creature'} (Level ${beastLevel}) appears! Battle begins!`;
    } else if (log.data.discoveryType === 'Gold') {
      const gold = log.data.discoveryValue || 0;
      return `Found ${gold} gold coins!`;
    } else if (log.data.discoveryType === 'Item') {
      return 'An item discovered!';
    }
    return `${monster || 'Something'} appears!`;
  } else if (log.eventType === 'Died') {
    return 'This is where my journey ends...';
  }
  return 'The adventure continues...';
}

/**
 * Scene description oluştur (prompt için - GERÇEK DATA İLE DETAYLI)
 */
function generateSceneDescription(
  log: GameLog,
  monster: string | undefined,
  action: string,
  location: string,
  adventurer: AdventurerData
): string {
  const weaponName = getItemName(adventurer.equipment.weapon?.id || 0) || 'sword';
  const chestName = getItemName(adventurer.equipment.chest?.id || 0) || 'armor';
  const headName = getItemName(adventurer.equipment.head?.id || 0) || 'helmet';
  const { strength, dexterity, vitality } = adventurer.stats;
  const health = adventurer.health;
  
  // Prompt format: "ADVENTURER [ID] (HP: X, Weapon: Y) ACTION: Z TARGET: W DETAIL: ..."
  let desc = `ADVENTURER ${adventurer.id} (HP: ${health}, Weapon: ${weaponName}, Strength: ${strength}, Dexterity: ${dexterity})`;
  
  if (log.eventType === 'Attack' || log.eventType === 'BeastAttack') {
    const damage = log.data.damage || 0;
    const critical = log.data.criticalHit || false;
    const locationName = log.data.locationName || 'target';
    
    desc += ` ACTION: ${log.eventType === 'Attack' ? 'ATTACK' : 'DEFEND'}`;
    
    if (monster) {
      desc += ` TARGET: ${monster.toUpperCase()}`;
    }
    
    desc += ` DETAIL: ${damage} damage at ${locationName.toUpperCase()}`;
    
    if (critical) {
      desc += ` with CRITICAL_HIT. Visual Note: Bright flash and heavy impact sound effect, motion lines, speed effects`;
    } else {
      desc += `. Visual Note: Dynamic action scene, motion lines`;
    }
  } else if (log.eventType === 'Discovered') {
    if (log.data.discoveryType === 'Beast') {
      const beastLevel = log.data.beastLevel || '?';
      desc += ` ACTION: ENCOUNTER TARGET: ${monster?.toUpperCase() || 'BEAST'} (Level ${beastLevel})`;
    } else if (log.data.discoveryType === 'Gold') {
      const gold = log.data.discoveryValue || 0;
      desc += ` ACTION: DISCOVERY DETAIL: Found ${gold} gold coins`;
    } else {
      desc += ` ACTION: DISCOVERY TARGET: ${monster?.toUpperCase() || 'UNKNOWN'}`;
    }
  } else {
    desc += ` ACTION: ${log.eventType.toUpperCase()}`;
  }
  
  desc += `, in ${location}, dynamic action scene, motion lines, speed effects, dramatic shadows, classic comic book style`;
  
  return desc;
}

/**
 * 20 sahneyi 4'lü gruplara böler ve comic sayfaları oluşturur
 */
export function createComicPages(scenes: GameScene[]): ComicPage[] {
  const pages: ComicPage[] = [];
  const panelsPerPage = 4;
  
  for (let i = 0; i < scenes.length; i += panelsPerPage) {
    const pageScenes = scenes.slice(i, i + panelsPerPage);
    const pageNumber = Math.floor(i / panelsPerPage) + 1;
    
    // Page description (4 sahnenin özeti)
    const pageDescription = generatePageDescription(pageScenes);
    
    // Image prompt (4 panel için combined prompt)
    const imagePrompt = generateComicPagePrompt(pageScenes);
    
    pages.push({
      pageNumber,
      scenes: pageScenes,
      pageDescription,
      imagePrompt
    });
  }
  
  return pages;
}

/**
 * Sayfa açıklaması oluştur
 */
function generatePageDescription(scenes: GameScene[]): string {
  const descriptions = scenes.map((scene, idx) => {
    const panelNum = scenes[0].panelNumber + idx;
    return `Panel ${panelNum}: ${scene.speechBubble}`;
  });
  
  return `Page ${scenes[0].panelNumber / 4 + 1}: ${descriptions.join(' | ')}`;
}

/**
 * Comic page prompt oluştur (Replicate için - GERÇEK SCENE DESCRIPTION KULLANARAK)
 */
function generateComicPagePrompt(scenes: GameScene[]): string {
  const panelDescriptions = scenes.map((scene, idx) => {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const position = positions[idx] || `position ${idx + 1}`;
    
    // Her panel için GERÇEK SCENE DESCRIPTION kullan (çok daha detaylı)
    // scene.description zaten generateSceneDescription'dan geliyor ve çok detaylı
    let cleanDescription = scene.description
      .replace(/ADVENTURER \d+ /g, '') // ADVENTURER ID'yi kaldır (prompt'ta gereksiz)
      .replace(/Visual Note: [^,]*/gi, '') // Visual Note'ları kaldır (sadece görsel talimatları tut)
      .trim();
    
    return `Panel ${idx + 1} (${position}): ${cleanDescription}, THIS PANEL MUST BE COMPLETELY DIFFERENT FROM ALL OTHER PANELS - DIFFERENT monster, DIFFERENT action, DIFFERENT location, DIFFERENT composition, DIFFERENT perspective, UNIQUE scene`;
  }).join(' | ');
  
  return `Professional comic book page, 2x2 grid layout with exactly 4 COMPLETELY DISTINCT AND UNIQUE panels, black and white charcoal drawing, pen and ink illustration, classic comic book style, MANDATORY: each panel shows a COMPLETELY DIFFERENT scene with DIFFERENT monster/enemy, DIFFERENT action, DIFFERENT location, DIFFERENT composition, DIFFERENT camera angle, dynamic action scenes with motion lines and speed effects, dramatic shadows, high contrast, each panel clearly separated with thick black borders (3-5px), panels arranged in a perfect grid format, NO REPEATED SCENES OR SIMILAR COMPOSITIONS: ${panelDescriptions}, detailed linework, hatching and crosshatching techniques, dramatic composition, monochrome, no colors, grayscale, 1024x1024 resolution, professional comic book page layout, NO speech bubbles or text in images, each panel must be visually distinct and unique, classic comic book illustration style, action-packed scenes`;
}

