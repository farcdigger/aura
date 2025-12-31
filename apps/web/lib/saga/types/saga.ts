// src/types/saga.ts

export type SagaStatus = 'pending' | 'generating_story' | 'generating_images' | 'rendering' | 'completed' | 'failed';

export interface StoryPanel {
  panelNumber: number;
  narration: string; // Backward compatibility
  speechBubble?: string; // Konuşma balonu metni (karikatür için)
  imagePrompt: string;
  imageUrl?: string;
  sceneType: 'battle' | 'discovery' | 'upgrade' | 'death' | 'victory' | 'rest';
  mood: 'tense' | 'triumphant' | 'desperate' | 'mysterious' | 'peaceful' | 'funny' | 'excited' | 'surprised' | 'happy';
}

// Comic Page: Bir sayfada 4-5 panel içeren comic book sayfası
export interface ComicPage {
  pageNumber: number;
  panels: StoryPanel[]; // Bu sayfadaki paneller (4-5 adet)
  pageImageUrl?: string; // Tüm sayfanın tek görseli (grid layout)
  pageImagePrompt?: string; // Sayfa için görsel prompt
  pageDescription?: string; // Sayfa açıklaması/anlatımı
}

export interface GeneratedStory {
  title: string;
  panels: StoryPanel[]; // Tüm paneller (20 adet)
  pages: ComicPage[]; // Comic sayfaları (4-5 adet, her biri 4-5 panel içerir)
  totalPanels: number;
  totalPages: number;
  theme: string; // 'Heroic Journey', 'Tragic Fall', 'Epic Comeback', etc.
}

export interface SagaRecord {
  id: string;
  game_id: string;
  user_wallet: string;
  status: SagaStatus;
  story_text: string | null;
  panels: StoryPanel[] | null;
  total_panels: number | null;
  generation_time_seconds: number | null;
  cost_usd: number | null;
  final_url: string | null;
  share_url: string | null;
  created_at: string;
  completed_at: string | null;
}

