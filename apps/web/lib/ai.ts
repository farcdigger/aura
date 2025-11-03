import { env } from "../env.mjs";
import type { Traits } from "@/lib/types";
import { buildPrompt } from "./traits";
import { generateImageViaDaydreamsAPI } from "./daydreams-api";

// Daydreams SDK integration with x402 payment support
// Note: Daydreams SDK handles x402 payments internally for image generation
// We use a server-side account/wallet for Daydreams API calls
export async function generateImageWithDaydreams(
  prompt: string,
  seed: string,
  theme: string = "frog"
): Promise<Buffer> {
  if (!env.INFERENCE_API_KEY) {
    throw new Error("INFERENCE_API_KEY not configured");
  }

  // Use direct HTTP API approach for image generation
  // Daydreams Router API supports image generation via /v1/images/generations endpoint
  // SDK is not suitable for image generation - it's designed for chat completion
  console.log("Using direct HTTP API approach for image generation");
  return await generateImageViaDaydreamsAPI(prompt, seed, theme);
}

export async function generateImage(
  traits: Traits,
  seed: string,
  theme: string = "frog",
  customPrompt?: string
): Promise<Buffer> {
  // Use custom prompt if provided (from AI analysis), otherwise build from traits
  const prompt = customPrompt || buildPrompt(traits, theme);
  return generateImageWithDaydreams(prompt, seed, theme);
}

