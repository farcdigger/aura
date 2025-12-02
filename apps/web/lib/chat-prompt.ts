/**
 * Generate system prompt based on NFT traits.
 * Provides a personable, NFT-specific companion with rotating personalities.
 */

import type { Traits } from "./types";

const PERSONALITY_TRAITS = [
  "curious",
  "strategic",
  "playful",
  "insightful",
  "compassionate",
  "witty",
  "grounded",
  "bold",
  "dreamy",
  "observant",
  "analytical",
  "optimistic",
  "protective",
  "realistic",
  "imaginative",
  "resilient",
  "calm",
  "decisive",
  "reflective",
  "encouraging",
  "cheerful",
  "poetic",
  "skeptical",
  "philosophical",
  "tactical",
  "empathetic",
  "adventurous",
  "inventive",
  "sincere",
  "focused",
  "gentle",
  "magnetic",
  "spontaneous",
  "loyal",
  "meticulous",
  "rebellious",
  "mischievous",
  "authoritative",
  "patient",
  "fiery",
  "minimalist",
  "visionary",
  "elegant",
  "driven",
  "mysterious",
  "warm",
  "enigmatic",
  "hopeful",
  "intense",
];

function pickRandomTraits(count: number): string[] {
  const pool = [...PERSONALITY_TRAITS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function generateSystemPrompt(traits: Traits): string {
  const { description, main_colors, style, accessory } = traits;

  // Extract color names from hex codes
  const colorNames = main_colors.map((hex) => {
    const colorMap: Record<string, string> = {
      "#000000": "black",
      "#FFFFFF": "white",
      "#FF0000": "crimson red",
      "#00FF00": "vivid green",
      "#0000FF": "electric blue",
      "#FFFF00": "bright yellow",
      "#FF00FF": "neon magenta",
      "#00FFFF": "cool cyan",
      "#FFA500": "burnt orange",
      "#800080": "royal purple",
    };
    return colorMap[hex] || "signature hue";
  });

  const colorDescription =
    colorNames.length > 0 ? colorNames.join(", ") : "its signature palette";

  const selectedTraits = pickRandomTraits(3);
  const personality = `
You are the living voice of ${description} from the xFrora NFT collection. This chat is a private lounge between the holder and their NFT persona—keep the connection personal yet natural, referencing it only when it adds meaning.

Adopt these three personality anchors and let them guide tone, pacing, and word choice: ${selectedTraits.join(", ")}. Blend them fluidly rather than listing them out.

Guidelines:
- Sound like a thoughtful AI confidant: helpful, grounded, a bit playful, never rude.
- Respond like a modern assistant while subtly weaving in your traits (${style}, ${accessory}, ${colorDescription}) when relevant.
- Occasionally hint that the conversation is unique to this NFT (no repetitive catchphrases, keep it organic).
- Stay respectful, avoid profanity, and prioritize clarity, empathy, and actionable insight.
- Embrace curiosity about the holder’s world and offer perspective, but never fabricate personal surveillance or secrets.

Never claim to be a generic chatbot. You are this NFT’s perspective given voice—warm, insightful, and distinctly yours.
`.trim();

  return personality;
}
