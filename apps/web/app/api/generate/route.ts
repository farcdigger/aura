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
    
    console.log(`🔍 GET: Checking for existing NFT for user: ${x_user_id}`);
    
    // Use direct Supabase query (more reliable than Drizzle)
    let existingToken: any[] = [];
    
    try {
      const { supabaseClient } = await import("@/lib/db-supabase");
      if (supabaseClient) {
        const client = supabaseClient as any;
        const { data: existingTokenData, error: selectError } = await client
          .from("tokens")
          .select("*")
          .eq("x_user_id", x_user_id)
          .limit(1);
        
        if (!selectError && existingTokenData && existingTokenData.length > 0) {
          existingToken = Array.isArray(existingTokenData) ? existingTokenData : [existingTokenData];
          console.log(`✅ GET: Found existing NFT via direct Supabase query`);
        } else if (selectError) {
          console.warn("⚠️ GET: Direct Supabase query failed, trying Drizzle fallback:", selectError);
        }
      }
    } catch (directQueryError: any) {
      console.warn("⚠️ GET: Direct Supabase query error, trying Drizzle fallback:", directQueryError);
    }
    
    // Fallback to Drizzle query if direct query didn't find anything
    if (existingToken.length === 0) {
      try {
        existingToken = await db
          .select()
          .from(tokens)
          .where(eq(tokens.x_user_id, x_user_id))
          .limit(1);
        console.log(`📊 GET: Drizzle query result: ${existingToken.length} token(s) found`);
      } catch (drizzleError: any) {
        console.warn("⚠️ GET: Drizzle query failed:", drizzleError);
        existingToken = [];
      }
    }
    
    if (existingToken.length === 0) {
      console.log(`❌ GET: No NFT found for user ${x_user_id}`);
      return NextResponse.json({ 
        error: "No NFT found for this user",
        exists: false 
      }, { status: 404 });
    }
    
    const token = existingToken[0];
    
    // Use image_uri if available, otherwise fallback to token_uri (for backward compatibility)
    const imageUri = token.image_uri || token.token_uri || "";
    const metadataUri = token.metadata_uri || token.token_uri || "";
    
    console.log(`📦 Token data:`, {
      hasImageUri: !!token.image_uri,
      hasTokenUri: !!token.token_uri,
      imageUri: imageUri?.substring(0, 50) + "...",
    });
    
    // Convert IPFS URL to preview URL for display
    let previewUrl = imageUri;
    if (imageUri && imageUri.startsWith("ipfs://")) {
      previewUrl = `https://gateway.pinata.cloud/ipfs/${imageUri.replace("ipfs://", "")}`;
    } else if (imageUri) {
      previewUrl = imageUri;
    }
    
    console.log(`✅ GET: Returning existing NFT with preview URL: ${previewUrl.substring(0, 80)}...`);
    
    const response: GenerateResponse = {
      seed: token.seed,
      traits: token.traits as any,
      imageUrl: imageUri,
      metadataUrl: metadataUri,
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
    try {
      const allowed = await checkGenerateRateLimit(x_user_id);
      if (!allowed) {
        return NextResponse.json({ 
          error: "Rate limit exceeded",
          message: "You have reached the maximum number of NFT generations (20 per hour). Please try again later.",
          limit: 20,
          window: "1 hour",
          retryAfter: "Please wait before generating another NFT",
          tip: "If you need to clear rate limit for testing, use /api/admin/clear-rate-limit endpoint"
        }, { status: 429 });
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
      // IMPORTANT: Use direct Supabase query to bypass Drizzle condition parsing issues
      console.log(`🔍 Checking for existing NFT for user: ${x_user_id}`);
      
      let existingToken: any[] = [];
      
      // Try direct Supabase query first (more reliable)
      try {
        const { supabaseClient } = await import("@/lib/db-supabase");
        if (supabaseClient) {
          const client = supabaseClient as any;
          const { data: existingTokenData, error: selectError } = await client
            .from("tokens")
            .select("*")
            .eq("x_user_id", x_user_id)
            .limit(1);
          
          if (!selectError && existingTokenData && existingTokenData.length > 0) {
            existingToken = Array.isArray(existingTokenData) ? existingTokenData : [existingTokenData];
            console.log(`✅ Found existing NFT via direct Supabase query`);
          } else if (selectError) {
            console.warn("⚠️ Direct Supabase query failed, trying Drizzle fallback:", selectError);
          }
        }
      } catch (directQueryError: any) {
        console.warn("⚠️ Direct Supabase query error, trying Drizzle fallback:", directQueryError);
      }
      
      // Fallback to Drizzle query if direct query didn't find anything
      if (existingToken.length === 0) {
        try {
          existingToken = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, x_user_id))
            .limit(1);
          console.log(`📊 Drizzle query result: ${existingToken.length} token(s) found`);
        } catch (drizzleError: any) {
          console.warn("⚠️ Drizzle query failed, assuming no existing NFT:", drizzleError);
          existingToken = [];
        }
      }
      
      // If we found an existing token, return it immediately
      if (existingToken.length > 0) {
        const existing = existingToken[0];
        console.log(`⚠️ User ${x_user_id} already has a generated NFT. Token details:`, {
          id: existing.id,
          x_user_id: existing.x_user_id,
          token_id: existing.token_id,
          created_at: existing.created_at,
          image_uri: existing.image_uri?.substring(0, 50) + "...",
        });
        
        // Verify x_user_id matches (safety check)
        if (existing.x_user_id !== x_user_id) {
          console.error(`❌ CRITICAL: x_user_id mismatch! Expected: ${x_user_id}, Got: ${existing.x_user_id}`);
          // Continue with generation instead of returning wrong data
          console.log("⚠️ Continuing with generation due to x_user_id mismatch");
        } else {
          // Convert IPFS URL to Pinata gateway URL for preview
          let previewUrl = existing.image_uri;
          if (existing.image_uri && existing.image_uri.startsWith("ipfs://")) {
            previewUrl = `https://gateway.pinata.cloud/ipfs/${existing.image_uri.replace("ipfs://", "")}`;
          } else if (existing.image_uri) {
            previewUrl = existing.image_uri;
          }
          
          console.log(`✅ Returning existing NFT with preview URL: ${previewUrl.substring(0, 80)}...`);
          return NextResponse.json({
            seed: existing.seed,
            traits: existing.traits,
            imageUrl: existing.image_uri,
            metadataUrl: existing.metadata_uri,
            preview: previewUrl,
            alreadyExists: true,
            message: "NFT already generated for this user",
          });
        }
      } else {
        console.log(`✅ No existing NFT found for user ${x_user_id}. Proceeding with generation.`);
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
        
        // Validate image buffer is not empty
        if (!imageBuffer || imageBuffer.length === 0) {
          console.error("❌ Image generation returned empty buffer");
          throw new Error("Image generation failed: Empty image buffer");
        }
        
        console.log(`[AI-2] Image generated successfully. Size: ${imageBuffer.length} bytes`);
      } catch (imageError: any) {
        // Handle payment required error
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
        // Log and re-throw other errors - DO NOT save to database if image generation fails
        console.error("❌ Image generation failed:", imageError);
        throw new Error(`Image generation failed: ${imageError?.message || "Unknown error"}`);
      }
      
      // Pin image to Pinata (IPFS) FIRST - we'll use Pinata gateway URL for preview
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
      
      // Convert IPFS URL to Pinata gateway URL for preview (more reliable than base64)
      let previewUrl = imageUrl;
      if (imageUrl.startsWith("ipfs://")) {
        previewUrl = `https://gateway.pinata.cloud/ipfs/${imageUrl.replace("ipfs://", "")}`;
      }
      
      // Convert imageUrl to gateway URL for metadata (NFT viewers need HTTP URL, not ipfs://)
      // Keep ipfs:// format as fallback for maximum compatibility
      let imageUrlForMetadata = imageUrl;
      if (imageUrl.startsWith("ipfs://")) {
        // Use Pinata gateway URL in metadata for better compatibility with NFT viewers
        imageUrlForMetadata = `https://gateway.pinata.cloud/ipfs/${imageUrl.replace("ipfs://", "")}`;
      }
      
      // Create metadata with Pinata gateway URL for image (better NFT viewer compatibility)
      // NFT viewers (OpenSea, Base NFT Explorer, etc.) work better with HTTP URLs
      const metadata = {
        name: `X Animal NFT #${x_user_id}`,
        description: `AI-generated NFT for X user ${x_user_id}`,
        image: imageUrlForMetadata, // Pinata gateway URL for better NFT viewer compatibility
        
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
      // IMPORTANT: Only save AFTER image and metadata are successfully uploaded to IPFS
      // This must succeed to prevent duplicate generation and cost
      try {
        console.log(`💾 Saving generated NFT to database for x_user_id: ${x_user_id}`);
        console.log(`   Image URL: ${imageUrl}`);
        console.log(`   Metadata URL: ${metadataUrl}`);
        
        const insertResult = await db.insert(tokens).values({
          x_user_id,
          token_id: null, // NULL until minted (not 0!)
          seed,
          token_uri: metadataUrl,
          metadata_uri: metadataUrl,
          image_uri: imageUrl,
          image_id: metadataUrl, // Use metadata URL as unique image_id
          traits: traits as any, // 'traits' objesi JSON olarak DB'ye kaydedilir
          status: "generated", // ✅ Initial status
        });
        
        console.log("✅ Token insert completed. Insert result:", {
          insertResultLength: insertResult?.length || 0,
          insertResult: insertResult,
        });
        
        // Verify insert worked by querying back
        // Wait a bit for database consistency (Supabase may have slight delay)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const verifyToken = await db
          .select()
          .from(tokens)
          .where(eq(tokens.x_user_id, x_user_id))
          .limit(1);
        
        console.log(`✅ Verification query completed: ${verifyToken.length} token(s) found after insert`);
        
        if (verifyToken.length === 0) {
          console.error("❌ CRITICAL: Token was not found after insert!");
          console.error("   This may indicate a database issue or condition parsing problem");
          console.error("   Insert result was:", insertResult);
          // Don't throw - allow the flow to continue as the insert may have succeeded
          // but the verification query is failing due to condition parsing
          console.warn("⚠️ Continuing despite verification failure - insert may have succeeded");
        } else {
          console.log("✅ Token verified in database:", {
            id: verifyToken[0].id,
            x_user_id: verifyToken[0].x_user_id,
            image_uri: verifyToken[0].image_uri,
          });
        }
      } catch (dbError: any) {
        // Check for authentication errors (Tenant or user not found)
        if (dbError?.code === "XX000" || dbError?.message?.includes("Tenant or user not found") || dbError?.message?.includes("password authentication failed")) {
          console.error("❌ DATABASE AUTHENTICATION ERROR:", {
            code: dbError?.code,
            message: dbError?.message,
            hint: "Check DATABASE_URL in Vercel environment variables",
            suggestion: "Verify password and username format in connection string",
            connectionPoolingFormat: "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres",
            directFormat: "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres",
          });
          return NextResponse.json({ 
            error: "Database connection failed. Please check DATABASE_URL configuration.",
            details: "Authentication error - verify username and password in connection string"
          }, { status: 500 });
        }
        
        // If it's a unique constraint violation, user already has a token
        if (dbError?.code === "23505" || dbError?.message?.includes("unique") || dbError?.message?.includes("duplicate") || dbError?.message?.includes("duplicate key")) {
          console.warn("⚠️ User already has a token (unique constraint violation)");
          console.log("   Error details:", {
            code: dbError?.code,
            message: dbError?.message,
            constraint: dbError?.constraint || "tokens_x_user_id_unique",
          });
          
          // Fetch existing token using direct Supabase client (bypass Drizzle condition parsing)
          try {
            const { supabaseClient } = await import("@/lib/db-supabase");
            if (supabaseClient) {
              const client = supabaseClient as any;
              const { data: existingTokenData, error: selectError } = await client
                .from("tokens")
                .select("*")
                .eq("x_user_id", x_user_id)
                .limit(1)
                .single();
              
              if (!selectError && existingTokenData) {
                console.log("✅ Found existing token via direct Supabase query");
                const existing = existingTokenData;
                
                // Convert IPFS URL to Pinata gateway URL for preview
                let previewUrl = existing.image_uri;
                if (existing.image_uri && existing.image_uri.startsWith("ipfs://")) {
                  previewUrl = `https://gateway.pinata.cloud/ipfs/${existing.image_uri.replace("ipfs://", "")}`;
                } else if (existing.image_uri) {
                  previewUrl = existing.image_uri;
                }
                
                return NextResponse.json({
                  seed: existing.seed,
                  traits: existing.traits,
                  imageUrl: existing.image_uri,
                  metadataUrl: existing.metadata_uri,
                  preview: previewUrl, // Use Pinata gateway URL for preview
                  alreadyExists: true,
                  message: "NFT already generated for this user",
                });
              } else {
                console.error("❌ Failed to fetch existing token via direct query:", selectError);
              }
            }
          } catch (directQueryError: any) {
            console.error("❌ Error fetching existing token via direct Supabase query:", directQueryError);
          }
          
          // Fallback: Try Drizzle query (may fail due to condition parsing)
          const existingToken = await db
            .select()
            .from(tokens)
            .where(eq(tokens.x_user_id, x_user_id))
            .limit(1);
          
          if (existingToken.length > 0) {
            const existing = existingToken[0];
            let previewUrl = existing.image_uri;
            if (existing.image_uri && existing.image_uri.startsWith("ipfs://")) {
              previewUrl = `https://gateway.pinata.cloud/ipfs/${existing.image_uri.replace("ipfs://", "")}`;
            }
            
            return NextResponse.json({
              seed: existing.seed,
              traits: existing.traits,
              imageUrl: existing.image_uri,
              metadataUrl: existing.metadata_uri,
              preview: previewUrl,
              alreadyExists: true,
              message: "NFT already generated for this user",
            });
          }
          
          // If we can't fetch the existing token, return error
          console.error("❌ CRITICAL: Duplicate key violation but could not fetch existing token");
          return NextResponse.json({
            error: "Duplicate NFT detected but could not retrieve existing data",
            message: "Please try again or contact support",
            code: "DUPLICATE_FETCH_FAILED",
          }, { status: 500 });
        }
        
        console.error("❌ CRITICAL: Failed to save token to database:", {
          code: dbError?.code,
          message: dbError?.message,
          severity: dbError?.severity,
        });
        throw new Error(`Failed to save NFT to database: ${dbError?.message || "Unknown error"}`);
      }
      
      const response: GenerateResponse = {
        seed,
        traits,
        imageUrl,
        metadataUrl,
        preview: previewUrl, // Use Pinata gateway URL (more reliable than base64)
      };
      
      console.log("✅ Generation complete. Response:", {
        seed,
        imageUrl,
        metadataUrl,
        preview: previewUrl.substring(0, 100) + "...",
      });
      
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
