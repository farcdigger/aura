// lib/traits.ts dosyasının YENİ içeriği

import { createHash } from "crypto";
import type { Traits } from "@/lib/types"; // Artık YENİ Traits tipini import ediyoruz

// Bu fonksiyonu hala veritabanı/kilitleme için kullanıyoruz
export function generateSeed(xUserId: string, profileImageUrl: string): string {
  const hash = createHash("sha256")
    .update(`${xUserId}:${profileImageUrl}`)
    .digest("hex");
  return hash.substring(0, 16);
}

// ARTIK GEREKLİ DEĞİL:
// const colors = [...]
// const eyes = [...]
// const ears = [...]
// const mouths = [...]
// const outfits = [...]
// const hands = [...]
// const backgrounds = [...]
// export function seedToTraits(seed: string): Traits { ... }
// YUKARIDAKİ TÜM ESKİ KODLARI SİLDİK.

// --- İŞTE YENİ SABİT ŞABLONUNUZ ---
// Bu fonksiyon artık AI #1'den gelen (vision.ts) gerçek özellikleri alıyor
export function buildPrompt(traits: Traits, theme: string): string {
  
  // Gelen özellikleri metne dök
  const colorPrompt = `dominant colors of ${traits.main_colors.join(", ")}`;
  const descriptionPrompt = `based on a profile picture of ${traits.description}`;

  // 'theme' değişkenini (koleksiyon teması) kullanarak şablonu oluştur
  return `A high-detail, cinematic portrait of a ${theme} creature.
  The creature is ${descriptionPrompt}.
  Its visual style is ${traits.style}, featuring ${colorPrompt}.
  It wears a cool ${traits.accessory}.
  Fixed base: big expressive eyes with natural reflections, realistic skin/fur texture, humanoid stance, gentle smile.
  Style: photo-realistic, volumetric lighting, cinematic bokeh, soft focus, ultra detailed eyes, expressive face, 8k render, unreal engine realism, studio photo composition, shallow depth of field.`;
}