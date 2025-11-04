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

// GET endpoint: Retrieve existing NFT for user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const x_user_id = searchParams.get("x_user_id");
    
    if (!x_user_id) {
      return NextResponse.json({ error: "Missing x_user_id parameter" }, { status: 400 });
    }
    
    // Fetch existing token from database
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.x_user_id, x_user_id))
      .limit(1);
    
    if (existingToken.length === 0) {
      return NextResponse.json({ 
        error: "No NFT found for this user",
        exists: false 
      }, { status: 404 });
    }
    
    const token = existingToken[0];
    
    // Convert IPFS URL to preview URL for display
    let previewUrl = token.image_uri;
    if (token.image_uri.startsWith("ipfs://")) {
      previewUrl = `https://gateway.pinata.cloud/ipfs/${token.image_uri.replace("ipfs://", "")}`;
    }
    
    const response: GenerateResponse = {
      seed: token.seed,
      traits: token.traits as any,
      imageUrl: token.image_uri,
      metadataUrl: token.metadata_uri,
      preview: previewUrl,
      alreadyExists: true,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get NFT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve NFT" },
      { status: 500 }
    );
  }
}

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
      // Check if user already has a generated NFT (prevent duplicate generation and cost)
      const existingToken = await db
        .select()
        .from(tokens)
        .where(eq(tokens.x_user_id, x_user_id))
        .limit(1);
      
      if (existingToken.length > 0) {
        console.log(`⚠️ User ${x_user_id} already has a generated NFT. Returning existing data.`);
        const existing = existingToken[0];
        return NextResponse.json({
          seed: existing.seed,
          traits: existing.traits,
          imageUrl: existing.image_uri,
          metadataUrl: existing.metadata_uri,
          preview: existing.image_uri.startsWith("ipfs://") 
            ? `https://gateway.pinata.cloud/ipfs/${existing.image_uri.replace("ipfs://", "")}` 
            : existing.image_uri,
          alreadyExists: true,
          message: "NFT already generated for this user",
        });
      }
      
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
      
      // Pin image to Pinata (IPFS)
      console.log(`📤 Pinning generated image to Pinata for user ${x_user_id}...`);
      let imageUrl: string;
      try {
        imageUrl = await pinToIPFS(imageBuffer, `${x_user_id}.png`);
        console.log(`✅ Image successfully pinned to Pinata: ${imageUrl}`);
      } catch (ipfsError: any) {
        console.error("❌ Failed to pin image to Pinata:", ipfsError);
        return NextResponse.json(
          { 
            error: "Failed to upload image to Pinata",
            details: ipfsError?.message || "Unknown IPFS error",
            hint: "Check PINATA_JWT environment variable in Vercel"
          },
          { status: 500 }
        );
      }
      
      // Create metadata with Pinata IPFS URL for image
      const metadata = {
        name: `X Animal NFT #${x_user_id}`,
        description: `AI-generated NFT for X user ${x_user_id}`,
        image: imageUrl, // This will be ipfs://hash format from Pinata
        
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
      
      // Pin metadata to Pinata (IPFS)
      console.log(`📤 Pinning metadata to Pinata for user ${x_user_id}...`);
      let metadataUrl: string;
      try {
        metadataUrl = await pinJSONToIPFS(metadata);
        console.log(`✅ Metadata successfully pinned to Pinata: ${metadataUrl}`);
      } catch (ipfsError: any) {
        console.error("❌ Failed to pin metadata to Pinata:", ipfsError);
        return NextResponse.json(
          { 
            error: "Failed to upload metadata to Pinata",
            details: ipfsError?.message || "Unknown IPFS error",
            hint: "Check PINATA_JWT environment variable in Vercel"
          },
          { status: 500 }
        );
      }
      
      // Save to database (REQUIRED - for preventing duplicate generation)
      // This must succeed to prevent duplicate generation and cost
      try {
        console.log(`💾 Saving generated NFT to database for x_user_id: ${x_user_id}`);
        const insertResult = await db.insert(tokens).values({
          x_user_id,
          token_id: 0, // Will be updated after mint
          seed,
          token_uri: metadataUrl,
          metadata_uri: metadataUrl,
          image_uri: imageUrl,
          traits: traits as any, // 'traits' objesi JSON olarak DB'ye kaydedilir
        });
        console.log("✅ Token saved to database:", insertResult);
        
        // Verify insert worked
        const verifyToken = await db
          .select()
          .from(tokens)
          .where(eq(tokens.x_user_id, x_user_id))
          .limit(1);
        console.log(`✅ Verification: ${verifyToken.length} token(s) found after insert`);
        
        if (verifyToken.length === 0) {
          console.error("❌ CRITICAL: Token was not saved to database despite insert success!");
          throw new Error("Failed to verify token save to database");
        }
      } catch (dbError: any) {
        // If it's a unique constraint violation, user already has a token
        if (dbError?.code === "23505" || dbError?.message?.includes("unique") || dbError?.message?.includes("duplicate")) {
          console.warn("⚠️ User already has a token (unique constraint violation)");
          // Fetch existing token and return it
          const existingToken = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, x_user_id))
            .limit(1);
          
          if (existingToken.length > 0) {
            const existing = existingToken[0];
            return NextResponse.json({
              seed: existing.seed,
              traits: existing.traits,
              imageUrl: existing.image_uri,
              metadataUrl: existing.metadata_uri,
              preview: existing.image_uri.startsWith("ipfs://") 
                ? `https://gateway.pinata.cloud/ipfs/${existing.image_uri.replace("ipfs://", "")}` 
                : existing.image_uri,
              alreadyExists: true,
              message: "NFT already generated for this user",
            });
          }
        }
        
        console.error("❌ CRITICAL: Failed to save token to database:", dbError);
        throw new Error(`Failed to save NFT to database: ${dbError?.message || "Unknown error"}`);
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
