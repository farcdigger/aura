// src/types/game.ts

export interface AdventurerData {
  id: string;
  owner: string;
  name: string | null;
  health: number;
  xp: number;
  level: number;
  gold: number;
  beast: {
    id: number;
    name: string;
    tier: number;
  } | null;
  stats: {
    strength: number;
    dexterity: number;
    vitality: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  equipment: {
    weapon: { id: number; name: string; type: string; } | null;
    chest: { id: number; name: string; type: string; } | null;
    head: { id: number; name: string; type: string; } | null;
    waist: { id: number; name: string; type: string; } | null;
    foot: { id: number; name: string; type: string; } | null;
    hand: { id: number; name: string; type: string; } | null;
    neck: { id: number; name: string; type: string; } | null;
    ring: { id: number; name: string; type: string; } | null;
  };
  lastAction: {
    type: string;
    timestamp: string;
    details: any;
  } | null;
}

export interface GameLog {
  id: string;
  adventurerId: string;
  eventType: string; // 'Attack', 'Flee', 'Discovered', 'Upgraded', 'Died'
  timestamp: string;
  turnNumber: number;
  data: any;
}

export interface GameRecord {
  id: string;
  user_wallet: string;
  adventurer_name: string | null;
  level: number;
  total_turns: number;
  final_score: number;
  is_dead: boolean;
  death_reason: string | null;
  raw_data: {
    adventurer: AdventurerData;
    logs: GameLog[];
  };
  fetched_at: string;
}






