// Daydreams Router API - Direct HTTP API for image generation
// Documentation: https://docs.daydreams.systems/docs/router/v1/images/generations
import axios from "axios";
import { env } from "../env.mjs";

// Canvas import - optional, falls back to minimal PNG if not available
let createCanvas: any = null;
try {
  createCanvas = require("canvas").createCanvas;
} catch {
  // Canvas not available, will use fallback
}

/**
 * Generate a mock placeholder image for testing
 */
function generateMockImage(prompt: string, seed: string): Buffer {
  if (createCanvas) {
    try {
      const canvas = createCanvas(1024, 1024);
      const ctx = canvas.getContext("2d");
      
      const seedNum = parseInt(seed.substring(0, 8), 16) || 0;
      const hue = seedNum % 360;
      
      const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
      gradient.addColorStop(0, `hsl(${hue}, 70%, 50%)`);
      gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 30%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 1024);
      
      ctx.fillStyle = "white";
      ctx.font = "bold 48px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MOCK NFT", 512, 400);
      ctx.font = "32px Arial";
      ctx.fillText("Test Mode", 512, 500);
      ctx.font = "24px Arial";
      ctx.fillText(prompt.substring(0, 50), 512, 600);
      
      return canvas.toBuffer("image/png");
    } catch (error) {
      console.log("Canvas error, using fallback:", error);
    }
  }
  
  const minimalPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );
  return minimalPng;
}

/**
 * Generate image using Daydreams Router API directly via HTTP
 * Uses API key authentication
 */
export async function generateImageViaDaydreamsAPI(
  prompt: string,
  seed: string,
  theme: string = "frog"
): Promise<Buffer> {
  // Check if API key is configured
  if (!env.INFERENCE_API_KEY || env.INFERENCE_API_KEY === "" || env.INFERENCE_API_KEY === "mock") {
    console.log("🐛 Mock mode: INFERENCE_API_KEY not configured, using mock image");
    return generateMockImage(prompt, seed);
  }

  try {
    console.log("🔑 Using Daydreams API key authentication");
    console.log("📝 API Key:", env.INFERENCE_API_KEY.substring(0, 20) + "...");
    
    // Try image generation models
    const imageModels = [
      "openai/gpt-image-1",
      "imagen-4.0-generate-001",
      "stabilityai/sdxl-turbo",
    ];

    for (const model of imageModels) {
      try {
        console.log(`🎨 Trying image generation with model: ${model}`);
        
        const response = await axios.post(
          "https://api-beta.daydreams.systems/v1/images/generations",
          {
            model,
            prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
            quality: "medium", // Medium quality: $0.04-0.06 per image (balance between quality and cost)
            style: "natural",
          },
          {
            headers: {
              Authorization: `Bearer ${env.INFERENCE_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("✅ Daydreams API response received:", {
          status: response.status,
          hasData: !!response.data,
          dataKeys: response.data ? Object.keys(response.data) : [],
        });

        // Parse response
        if (response.data && response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
          const imageData = response.data.data[0];
          
          if (imageData.b64_json) {
            console.log("✅ Found base64 image data");
            return Buffer.from(imageData.b64_json, "base64");
          }
          
          if (imageData.url) {
            console.log("Found image URL, downloading...");
            if (imageData.url.startsWith("data:image")) {
              const base64Match = imageData.url.match(/data:image\/[^;]+;base64,(.+)/);
              if (base64Match && base64Match[1]) {
                return Buffer.from(base64Match[1], "base64");
              }
            }
            
            const imageResponse = await axios.get(imageData.url, {
              responseType: "arraybuffer",
            });
            return Buffer.from(imageResponse.data);
          }
        }
        
        console.log("⚠️ Unexpected response format");
      } catch (error: any) {
        const errorDetails = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        };
        console.log(`❌ Model ${model} failed:`, JSON.stringify(errorDetails, null, 2));
        
        // Handle 402 payment required error
        if (error.response?.status === 402) {
          console.log("⚠️ Daydreams API returned 402 (payment required)");
          console.log("💡 This means your Daydreams account needs sufficient balance");
          console.log("🔗 Add funds at: https://daydreams.systems");
          
          const paymentError = {
            code: "PAYMENT_REQUIRED",
            message: "Your Daydreams account has insufficient balance for image generation. Please add funds to your Daydreams account at https://daydreams.systems",
            details: error.response.data,
            requiresDaydreamsBalance: true,
          };
          const customError = new Error(JSON.stringify(paymentError));
          (customError as any).paymentRequired = true;
          (customError as any).paymentDetails = error.response.data;
          throw customError;
        }
        
        // Continue to next model
        if (error.response?.status === 400 || error.response?.status === 404) {
          console.log(`⚠️ Endpoint error for ${model}, trying next...`);
          continue;
        }
        
        // For other errors, try next model
        continue;
      }
    }

    throw new Error("All image generation models failed");
  } catch (error) {
    console.error("❌ Daydreams API error:", error);
    throw error; // Re-throw as-is (may be payment error)
  }
}
