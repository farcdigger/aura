import { NextRequest, NextResponse } from "next/server";
// DEĞİŞİKLİK: 'seedToTraits' fonksiyonunu sildik, artık kullanmayacağız.
import { generateSeed } from "@/lib/traits";
import { generateImage } from "@/lib/ai";
import { pinToIPFS, pinJSONToIPFS } from "@/lib/ipfs";
import { checkGenerateRateLimit } from "@/lib/rate-limit";
import { acquireLock, releaseLock } from "@/lib/kv";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { env } from "@/env.mjs";
import type { GenerateRequest, GenerateResponse } from "@/lib/types";
// DEĞİŞİKLİK: Yeni Vision AI (AI #1) fonksiyonumuzu import ediyoruz.
import { analyzeProfileImage } from "@/lib/vision";

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { x_user_id, profile_image_url } = body;
    
    if (!x_user_id || !profile_image_url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Rate limiting (OPTIONAL - fail-open if KV unavailable)
    // ... (Bu kısım aynı kaldı) ...
    try {
      const allowed = await checkGenerateRateLimit(x_user_id);
      if (!allowed) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
    } catch (rateLimitError) {
      console.warn("⚠️ Rate limit check failed, allowing request (fail-open):", rateLimitError);
    }
    
    // Acquire lock to prevent duplicate generation (fail-open if KV unavailable)
    // ... (Bu kısım aynı kaldı) ...
    const lockKey = `generate:${x_user_id}`;
    let lockAcquired = false;
    try {
      lockAcquired = await acquireLock(lockKey);
      if (!lockAcquired) {
        console.warn("Lock already exists, but continuing (KV may be unavailable)");
      }
    } catch (lockError) {
      console.warn("Failed to acquire lock, continuing anyway (fail-open):", lockError);
      lockAcquired = true;
   }
    
    try {
      // --- DEĞİŞİKLİK BAŞLANGICI ---
      
      // ESKİ KOD (SİLİNDİ):
      // // Use deterministic traits (vision analysis disabled due to SDK issues)
      // const seed = generateSeed(x_user_id, profile_image_url);
      // const traits = seedToTraits(seed);
      
      // YENİ KOD:
      // Adım 1: AI #1'i (Vision AI) çağır ve profil resmini analiz et
      console.log(`[AI-1] Analyzing image for ${x_user_id}: ${profile_image_url}`);
      const traits = await analyzeProfileImage(profile_image_url);
      console.log(`[AI-1] Traits generated:`, traits);
      
      // Adım 2: Seed'i veritabanı/kilitleme için hala üretiyoruz
      const seed = generateSeed(x_user_id, profile_image_url);
      
      // --- DEĞİŞİKLİK BİTİŞİ ---

      
      // Generate AI image using REAL traits (AI #2 - Daydreams)
      // Uses real Daydreams API - requires Daydreams account to have sufficient balance
      let imageBuffer: Buffer;
      try {
        console.log(`[AI-2] Generating image with Daydreams...`);
        imageBuffer = await generateImage(
          traits, // BURAYA ARTIK AI #1'DEN GELEN GERÇEK ÖZELLİKLER GİDİYOR
          seed,
          env.COLLECTION_THEME
        );
        console.log(`[AI-2] Image generated successfully.`);
      } catch (imageError: any) {
        // Handle payment required error
        // ... (Bu hata yönetimi kısmı aynı kaldı) ...
        if (imageError.paymentRequired || imageError.message?.includes("PAYMENT_REQUIRED")) {
          return NextResponse.json(
            {
              error: "Daydreams account balance insufficient",
              code: "PAYMENT_REQUIRED",
              message: "Your Daydreams account needs sufficient balance for image generation. Please add funds to your Daydreams account at https://daydreams.systems",
              details: imageError.paymentDetails || {},
              requiresDaydreamsBalance: true,
            },
            { status: 402 }
          );
        }
        // Re-throw other errors
        throw imageError;
      }
      
      // Convert image buffer to base64 for preview
      const imageBase64 = imageBuffer.toString("base64");
      const previewDataUrl = `data:image/png;base64,${imageBase64}`;
      
      // Pin image to IPFS
      console.log("Pinning image to IPFS...");
      const imageUrl = await pinToIPFS(imageBuffer, `${x_user_id}.png`);
      console.log(`Image pinned: ${imageUrl}`);
      
      // Create metadata
      const metadata = {
        name: `X Animal NFT #${x_user_id}`,
        description: `AI-generated NFT for X user ${x_user_id}`,
        image: imageUrl,
        
        // DEĞİŞİKLİK: NFT metadata'sının 'main_colors' gibi array'leri
        // düzgün işlemesi için küçük bir düzeltme.
        attributes: Object.entries(traits).map(([trait_type, value]) => ({
          trait_type,
          value: Array.isArray(value) ? value.join(", ") : value,
        })),
        
        seed,
        theme: env.COLLECTION_THEME,
        version: env.MODEL_VERSION,
      };
      
      // Pin metadata to IPFS
      console.log("Pinning metadata to IPFS...");
      const metadataUrl = await pinJSONToIPFS(metadata);
      console.log(`Metadata pinned: ${metadataUrl}`);
      
      // Save to database (OPTIONAL - for tracking/preventing duplicates)
      // ... (Bu kısım aynı kaldı) ...
      try {
        const existingToken = await db
          .select()
          .from(tokens)
          .where(eq(tokens.x_user_id, x_user_id))
          .limit(1);
        
        console.log(`Checking for existing token with x_user_id: ${x_user_id}`, existingToken.length);
        
        if (existingToken.length === 0) {
          // Token not minted yet, save generation data
          console.log(`Inserting token for x_user_id: ${x_user_id}`);
          const insertResult = await db.insert(tokens).values({
            x_user_id,
            token_id: 0, // Will be updated after mint
            seed,
            token_uri: metadataUrl,
            metadata_uri: metadataUrl,
            image_uri: imageUrl,
            traits: traits as any, // 'traits' objesi JSON olarak DB'ye kaydedilir
          });
          console.log("Insert result:", insertResult);
          
          // Verify insert worked
          const verifyToken = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, x_user_id))
            .limit(1);
          console.log(`Verification: ${verifyToken.length} tokens found after insert`);
        }
      } catch (dbError) {
        console.warn("⚠️ Failed to save token to database (non-critical):", dbError);
        console.warn("💡 Image generation succeeded - database save is optional");
      }
      
      const response: GenerateResponse = {
        seed,
        traits,
        imageUrl,
        metadataUrl,
        preview: previewDataUrl, // Base64 preview for immediate display
      };
      
      return NextResponse.json(response);
    } finally {
      // Release lock (ignore errors - KV may be unavailable)
      // ... (Bu kısım aynı kaldı) ...
      try {
        await releaseLock(lockKey);
      } catch (releaseError) {
        console.warn("Failed to release lock (non-critical):", releaseError);
      }
    }
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}