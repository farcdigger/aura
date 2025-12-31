// src/lib/blockchain/beast-mapping.ts
// Beast ID to name mapping (Loot Survivor standard)

export const BEAST_NAMES: Record<number, string> = {
  1: 'Warlock',
  2: 'Typhon',
  3: 'Jiangshi',
  4: 'Anansi',
  5: 'Basilisk',
  6: 'Gorgon',
  7: 'Kitsune',
  8: 'Lich',
  9: 'Chimera',
  10: 'Wendigo',
  11: 'Rakshasa',
  12: 'Werewolf',
  13: 'Banshee',
  14: 'Draugr',
  15: 'Vampire',
  16: 'Goblin',
  17: 'Ghoul',
  18: 'Wraith',
  19: 'Sprite',
  20: 'Kappa',
  21: 'Fairy',
  22: 'Leprechaun',
  23: 'Kelpie',
  24: 'Pixie',
  25: 'Gnome',
  26: 'Griffin',
  27: 'Manticore',
  28: 'Phoenix',
  29: 'Dragon',
  30: 'Minotaur',
  31: 'Qilin',
  32: 'Ammit',
  33: 'Nue',
  34: 'Skinwalker',
  35: 'Chupacabra',
  36: 'Weretiger',
  37: 'Wyvern',
  38: 'Roc',
  39: 'Harpy',
  40: 'Pegasus',
  41: 'Hippogriff',
  42: 'Fenrir',
  43: 'Jaguar',
  44: 'Satori',
  45: 'DireWolf',
  46: 'Bear',
  47: 'Wolf',
  48: 'Mantis',
  49: 'Spider',
  50: 'Rat',
  51: 'Kraken',
  52: 'Colossus',
  53: 'Balrog',
  54: 'Leviathan',
  55: 'Tarrasque',
  56: 'Titan',
  57: 'Nephilim',
  58: 'Behemoth',
  59: 'Hydra',
  60: 'Juggernaut',
  61: 'Oni',
  62: 'Jotunn',
  63: 'Ettin',
  64: 'Cyclops',
  65: 'Giant',
  66: 'NemeanLion',
  67: 'Berserker',
  68: 'Yeti',
  69: 'Golem',
  70: 'Ent',
  71: 'Troll',
  72: 'Bigfoot',
  73: 'Ogre',
  74: 'Orc',
  75: 'Skeleton'
};

export function getBeastName(beastId: number): string {
  return BEAST_NAMES[beastId] || `Beast ${beastId}`;
}

// Location ID to name mapping
export const LOCATION_NAMES: Record<number, string> = {
  1: 'Weapon',
  2: 'Chest',
  3: 'Head',
  5: 'Foot',
  6: 'Hand'
};

export function getLocationName(locationId: number): string {
  return LOCATION_NAMES[locationId] || `Location ${locationId}`;
}





