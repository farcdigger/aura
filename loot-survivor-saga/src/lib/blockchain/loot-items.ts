// src/lib/blockchain/loot-items.ts
// Loot Survivor item ID to name mapping
// Based on Loot standard item IDs

export const LOOT_ITEMS: Record<number, string> = {
  // --- TAKILAR (JEWELRY) ---
  1: "Pendant",
  2: "Necklace",
  3: "Amulet",
  4: "Silver Ring",
  5: "Bronze Ring",
  6: "Platinum Ring",
  7: "Titanium Ring",
  8: "Gold Ring",

  // --- SİLAHLAR (WEAPONS) ---
  // Magic
  9: "Ghost Wand",
  10: "Grave Wand",
  11: "Bone Wand",
  12: "Wand",
  13: "Grimoire",
  14: "Chronicle",
  15: "Tome",
  16: "Book",
  // Bludgeon
  17: "Warhammer",
  18: "Quarterstaff",
  19: "Maul",
  20: "Mace",
  21: "Club",
  // Blade
  22: "Katana",
  23: "Falchion",
  24: "Scimitar",
  25: "Long Sword",
  26: "Short Sword",

  // --- ZIRHLAR (CHEST) ---
  27: "Divine Robe",
  28: "Silk Robe",
  29: "Linen Robe",
  30: "Robe",
  31: "Shirt",
  32: "Demon Husk",
  33: "Dragonskin Armor",
  34: "Studded Leather Armor",
  35: "Hard Leather Armor",
  36: "Leather Armor",
  37: "Holy Chestplate",
  38: "Ornate Chestplate",
  39: "Plate Mail",
  40: "Chain Mail",
  41: "Ring Mail",

  // --- KASKLAR (HEAD) ---
  42: "Divine Hood",
  43: "Silk Hood",
  44: "Linen Hood",
  45: "Hood",
  46: "Demon Crown",
  47: "Dragonskin Helm",
  48: "War Cap",
  49: "Leather Cap",
  50: "Cap",
  51: "Holy Helm",
  52: "Ornate Helm",
  53: "Great Helm",
  54: "Full Helm",
  55: "Helm",

  // --- KEMERLER (WAIST) ---
  56: "Platinum Sash",
  57: "Gold Sash",
  58: "Silver Sash",
  59: "Bronze Sash",
  60: "Silk Sash",
  61: "Demonhide Belt",
  62: "Dragonskin Belt",
  63: "Studded Leather Belt",
  64: "Hard Leather Belt",
  65: "Leather Belt",
  66: "Brightsilk Sash",
  67: "Ornate Belt",
  68: "War Belt",
  69: "Plated Belt",
  70: "Mesh Belt",

  // --- AYAKKABILAR (FOOT) ---
  71: "Divine Slippers",
  72: "Silk Slippers",
  73: "Linen Shoes",
  74: "Shoes",
  75: "Demonhide Boots",
  76: "Dragonskin Boots",
  77: "Studded Leather Boots",
  78: "Hard Leather Boots",
  79: "Leather Boots",
  80: "Holy Greaves",
  81: "Ornate Greaves",
  82: "Greaves",
  83: "Chain Boots",
  84: "Heavy Boots",

  // --- ELDİVENLER (HAND) ---
  85: "Divine Gloves",
  86: "Silk Gloves",
  87: "Linen Gloves",
  88: "Gloves",
  89: "Demon's Hands",
  90: "Dragonskin Gloves",
  91: "Studded Leather Gloves",
  92: "Hard Leather Gloves",
  93: "Leather Gloves",
  94: "Holy Gauntlets",
  95: "Ornate Gauntlets",
  96: "Gauntlets",
  97: "Chain Gloves",
  98: "Ring Gloves",

  // --- KOLYELER (NECKLACES - Tekrar) ---
  99: "Pendant",  // Bazen kolyeler için farklı ID kullanılabilir
  100: "Necklace", // Loot'ta 99-101 arası takılar bazen karışabilir,
  101: "Amulet"    // ama ana listede 1-8 arası mücevherlerdir.
};

/**
 * Gets the item name by ID
 * @param itemId The item ID
 * @returns The item name, or "Unknown Item" if not found
 */
export function getItemName(itemId: number): string {
  return LOOT_ITEMS[itemId] || `Unknown Item (${itemId})`;
}

/**
 * Gets the item type (slot) based on ID ranges
 * @param itemId The item ID
 * @returns The item type/slot
 */
export function getItemType(itemId: number): string {
  if (itemId === 0) return 'none';
  
  // Jewelry (1-8, 99-101)
  if ((itemId >= 1 && itemId <= 8) || (itemId >= 99 && itemId <= 101)) {
    if (itemId === 1 || itemId === 2 || itemId === 3 || itemId === 99 || itemId === 100 || itemId === 101) {
      return 'neck';
    } else {
      return 'ring';
    }
  }
  
  // Weapons (9-26)
  if (itemId >= 9 && itemId <= 26) {
    return 'weapon';
  }
  
  // Chest (27-41)
  if (itemId >= 27 && itemId <= 41) {
    return 'chest';
  }
  
  // Head (42-55)
  if (itemId >= 42 && itemId <= 55) {
    return 'head';
  }
  
  // Waist (56-70)
  if (itemId >= 56 && itemId <= 70) {
    return 'waist';
  }
  
  // Foot (71-84)
  if (itemId >= 71 && itemId <= 84) {
    return 'foot';
  }
  
  // Hand (85-98)
  if (itemId >= 85 && itemId <= 98) {
    return 'hand';
  }
  
  return 'unknown';
}








