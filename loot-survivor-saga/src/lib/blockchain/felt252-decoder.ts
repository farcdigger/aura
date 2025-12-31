// src/lib/blockchain/felt252-decoder.ts
// Decodes packed felt252 data from Loot Survivor's Adventurer struct
// Based on: https://github.com/BibliothecaDAO/loot-survivor/blob/main/contracts/src/models/adventurer/adventurer.cairo

import type { AdventurerData } from '@/types/game';
import { getItemName, getItemType } from './loot-items';

// Constants from Cairo code (2^N values)
const TWO_POW_4 = 0x10n;
const TWO_POW_5 = 0x20n; // For stats (each stat is 5 bits)
const TWO_POW_7 = 0x80n; // For Item packing (id is 7 bits, so xp is multiplied by 2^7)
const TWO_POW_8 = 0x100n;
const TWO_POW_9 = 0x200n;
const TWO_POW_10 = 0x400n;
const TWO_POW_15 = 0x8000n;
const TWO_POW_16 = 0x10000n;
const TWO_POW_25 = 0x2000000n;
const TWO_POW_30 = 0x40000000n;
const TWO_POW_34 = 0x400000000n;
const TWO_POW_44 = 0x100000000000n;
const TWO_POW_48 = 0x1000000000000n;
const TWO_POW_78 = 0x40000000000000000000n;
const TWO_POW_128 = 0x100000000000000000000000000000000n;
const TWO_POW_206 = 0x4000000000000000000000000000000000000000000000000000n;
const TWO_POW_222 = 0x40000000000000000000000000000000000000000000000000000000n;

/**
 * Divides a bigint and returns quotient and remainder
 */
function divRem(dividend: bigint, divisor: bigint): [bigint, bigint] {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  return [quotient, remainder];
}

/**
 * Unpacks Item from a felt252 (16 bits)
 * Item structure: id (7 bits) + xp (9 bits) = 16 bits
 * Based on Cairo's ImplItem::unpack function
 * Packing format: id + xp * TWO_POW_7 (id is 7 bits, xp is 9 bits)
 */
function unpackItem(packed: bigint): { id: number; xp: number } {
  // Item packing: id (7 bits) + xp (9 bits) = 16 bits
  // From Cairo: item.pack() = id + xp * TWO_POW_7
  // So unpack: div_rem by TWO_POW_7 to get id, then remaining / TWO_POW_7 = xp
  // Actually, wait - if pack = id + xp * 128, then:
  // - div_rem by 128: id (0-127), remaining = xp * 128
  // - remaining / 128 = xp
  
  let [remaining, id] = divRem(packed, TWO_POW_7); // TWO_POW_7 = 128
  const xp = Number(remaining); // xp = remaining / 128 (but we already divided, so remaining IS xp)
  
  // Actually, if pack = id + xp * 128, then:
  // packed = id + xp * 128
  // packed / 128 = (id / 128) + xp
  // Since id < 128, id / 128 = 0, so packed / 128 = xp
  // packed % 128 = id
  
  // So correct unpack:
  const idValue = Number(packed % TWO_POW_7); // id is remainder (7 bits, 0-127)
  const xpValue = Number(packed / TWO_POW_7); // xp is quotient (9 bits, 0-511)
  
  return {
    id: idValue,
    xp: xpValue
  };
}

/**
 * Unpacks Stats from a felt252 (30 bits)
 * Stats structure: 6 stats, each 5 bits (strength, dexterity, vitality, intelligence, wisdom, charisma)
 * Based on Cairo's ImplStats::unpack function
 * Packing: strength + dexterity * 2^5 + vitality * 2^10 + intelligence * 2^15 + wisdom * 2^20 + charisma * 2^25
 */
function unpackStats(packed: bigint): {
  strength: number;
  dexterity: number;
  vitality: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  luck: number;
} {
  // Unpack in reverse order (from least significant to most significant)
  // This matches Cairo's div_rem pattern
  let [remaining, strength] = divRem(packed, TWO_POW_5);
  let [remaining2, dexterity] = divRem(remaining, TWO_POW_5);
  let [remaining3, vitality] = divRem(remaining2, TWO_POW_5);
  let [remaining4, intelligence] = divRem(remaining3, TWO_POW_5);
  let [remaining5, wisdom] = divRem(remaining4, TWO_POW_5);
  const charisma = Number(remaining5); // Last one, no need to div_rem

  return {
    strength: Number(strength),
    dexterity: Number(dexterity),
    vitality: Number(vitality),
    intelligence: Number(intelligence),
    wisdom: Number(wisdom),
    charisma: Number(charisma),
    luck: 0 // Luck is calculated from equipment, not stored in stats
  };
}

/**
 * Unpacks Equipment from a felt252 (128 bits)
 * Equipment structure: 8 items (weapon, chest, head, waist, foot, hand, neck, ring)
 * Each item: 16 bits (Item struct)
 * Based on Cairo's ImplEquipment::unpack function
 * Packing: weapon + chest * 2^16 + head * 2^32 + waist * 2^48 + foot * 2^64 + hand * 2^80 + neck * 2^96 + ring * 2^112
 */
function unpackEquipment(packed: bigint): {
  weapon: { id: number; xp: number };
  chest: { id: number; xp: number };
  head: { id: number; xp: number };
  waist: { id: number; xp: number };
  foot: { id: number; xp: number };
  hand: { id: number; xp: number };
  neck: { id: number; xp: number };
  ring: { id: number; xp: number };
} {
  // Unpack in reverse order (from least significant to most significant)
  // This matches Cairo's div_rem pattern
  let [remaining, weaponPacked] = divRem(packed, TWO_POW_16);
  let [remaining2, chestPacked] = divRem(remaining, TWO_POW_16);
  let [remaining3, headPacked] = divRem(remaining2, TWO_POW_16);
  let [remaining4, waistPacked] = divRem(remaining3, TWO_POW_16);
  let [remaining5, footPacked] = divRem(remaining4, TWO_POW_16);
  let [remaining6, handPacked] = divRem(remaining5, TWO_POW_16);
  let [remaining7, neckPacked] = divRem(remaining6, TWO_POW_16);
  const ringPacked = remaining7; // Last one, no need to div_rem

  // Each packed item is 16 bits, unpack it using Item::unpack
  return {
    weapon: unpackItem(weaponPacked),
    chest: unpackItem(chestPacked),
    head: unpackItem(headPacked),
    waist: unpackItem(waistPacked),
    foot: unpackItem(footPacked),
    hand: unpackItem(handPacked),
    neck: unpackItem(neckPacked),
    ring: unpackItem(ringPacked)
  };
}

/**
 * Unpacks Adventurer from a packed felt252
 * Based on Cairo's ImplAdventurer::unpack function
 * 
 * Packing format (from Cairo code):
 * - health: 10 bits (TWO_POW_10)
 * - xp: 15 bits (TWO_POW_15_NZ)
 * - gold: 9 bits (TWO_POW_9_NZ)
 * - beast_health: 10 bits (TWO_POW_10_NZ)
 * - stat_upgrades_available: 4 bits (TWO_POW_4_NZ)
 * - stats: 30 bits (TWO_POW_30_NZ)
 * - equipment: 128 bits (TWO_POW_128_NZ)
 * - item_specials_seed: 16 bits (TWO_POW_16_NZ_U256)
 * - action_count: 16 bits (TWO_POW_16_NZ_U256)
 */
export function unpackAdventurer(packedValue: string | bigint): Partial<AdventurerData> {
  try {
    // Convert string to bigint (handle hex strings like "0x..." or decimal strings)
    let packed: bigint;
    if (typeof packedValue === 'string') {
      // Remove "0x" prefix if present
      const cleanValue = packedValue.startsWith('0x') || packedValue.startsWith('0X')
        ? packedValue.slice(2)
        : packedValue;
      packed = BigInt('0x' + cleanValue);
    } else {
      packed = packedValue;
    }

    console.log('[Felt252 Decoder] Unpacking value:', packed.toString(16));

    // Unpack in reverse order (from least significant to most significant)
    // This matches the Cairo code's div_rem pattern
    
    // 1. Extract health (10 bits)
    let [remaining, health] = divRem(packed, TWO_POW_10);
    const healthValue = Number(health);

    // 2. Extract xp (15 bits)
    let [remaining2, xp] = divRem(remaining, TWO_POW_15);
    const xpValue = Number(xp);

    // 3. Extract gold (9 bits)
    let [remaining3, gold] = divRem(remaining2, TWO_POW_9);
    const goldValue = Number(gold);

    // 4. Extract beast_health (10 bits)
    let [remaining4, beastHealth] = divRem(remaining3, TWO_POW_10);
    const beastHealthValue = Number(beastHealth);

    // 5. Extract stat_upgrades_available (4 bits)
    let [remaining5, statUpgrades] = divRem(remaining4, TWO_POW_4);
    const statUpgradesValue = Number(statUpgrades);

    // 6. Extract stats (30 bits)
    let [remaining6, statsPacked] = divRem(remaining5, TWO_POW_30);
    const stats = unpackStats(statsPacked);

    // 7. Extract equipment (128 bits)
    let [remaining7, equipmentPacked] = divRem(remaining6, TWO_POW_128);
    const equipment = unpackEquipment(equipmentPacked);

    // 8. Extract item_specials_seed (16 bits)
    let [remaining8, itemSpecialsSeed] = divRem(remaining7, TWO_POW_16);
    const itemSpecialsSeedValue = Number(itemSpecialsSeed);

    // 9. Extract action_count (16 bits) - remaining is action_count
    const actionCountValue = Number(remaining8);

    // Calculate level from XP (simplified - actual formula from game)
    // Level formula: level = floor(sqrt(xp)) + 1 (approximately)
    const level = Math.floor(Math.sqrt(xpValue)) + 1;

    console.log('[Felt252 Decoder] Unpacked:', {
      health: healthValue,
      xp: xpValue,
      level,
      gold: goldValue,
      beastHealth: beastHealthValue,
      statUpgrades: statUpgradesValue,
      stats,
      equipment,
      actionCount: actionCountValue
    });

    return {
      health: healthValue,
      xp: xpValue,
      level,
      gold: goldValue,
      beast: beastHealthValue > 0 ? {
        id: 0, // Beast ID not in packed data
        name: 'Unknown',
        tier: 0
      } : null,
      stats,
      equipment: {
        weapon: equipment.weapon.id > 0 ? {
          id: equipment.weapon.id,
          name: getItemName(equipment.weapon.id),
          type: 'weapon' // Always weapon for weapon slot
        } : null,
        chest: equipment.chest.id > 0 ? {
          id: equipment.chest.id,
          name: getItemName(equipment.chest.id),
          type: 'chest' // Always chest for chest slot
        } : null,
        head: equipment.head.id > 0 ? {
          id: equipment.head.id,
          name: getItemName(equipment.head.id),
          type: 'head' // Always head for head slot
        } : null,
        waist: equipment.waist.id > 0 ? {
          id: equipment.waist.id,
          name: getItemName(equipment.waist.id),
          type: 'waist' // Always waist for waist slot
        } : null,
        foot: equipment.foot.id > 0 ? {
          id: equipment.foot.id,
          name: getItemName(equipment.foot.id),
          type: 'foot' // Always foot for foot slot
        } : null,
        hand: equipment.hand.id > 0 ? {
          id: equipment.hand.id,
          name: getItemName(equipment.hand.id),
          type: 'hand' // Always hand for hand slot
        } : null,
        neck: equipment.neck.id > 0 ? {
          id: equipment.neck.id,
          name: getItemName(equipment.neck.id),
          type: 'neck' // Always neck for neck slot
        } : null,
        ring: equipment.ring.id > 0 ? {
          id: equipment.ring.id,
          name: getItemName(equipment.ring.id),
          type: 'ring' // Always ring for ring slot
        } : null
      },
      lastAction: null,
      // Store raw equipment data (with XP) for debugging/access
      rawEquipment: equipment
    } as any; // Cast to any to include rawEquipment
  } catch (error: any) {
    console.error('[Felt252 Decoder] Error unpacking:', error);
    throw new Error(`Failed to unpack adventurer data: ${error.message}`);
  }
}

