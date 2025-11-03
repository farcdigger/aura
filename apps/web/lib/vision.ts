// lib/vision.ts (YENİ DOSYA)

import type { Traits } from "./types";

// Hata durumunda veya profil resmi anlamsızsa kullanılacak varsayılan özellikler
const DEFAULT_TRAITS: Traits = {
  description: "a mysterious and cool digital entity",
  main_colors: ["#000000", "#FFFFFF"],
  style: "digital-art",
  accessory: "glowing aura",
};

// Use direct HTTP request to v1 API endpoint (not v1beta)
// This ensures we use the correct API version regardless of package version
export async function analyzeProfileImage(imageUrl: string): Promise<Traits> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not set");
      return DEFAULT_TRAITS;
    }

    // AI #1'e vereceğimiz komut (prompt)
    const prompt = `Analyze this image. Your goal is to extract key visual traits.
    Respond ONLY with a valid JSON object matching this TypeScript type:
    type Traits = {
      description: string; // A 2-3 word description (e.g., 'a person smiling', 'a blue logo', 'a cat')
      main_colors: string[]; // An array of the 3 most dominant hex color codes (e.g., ["#FF0000", "#0000FF"])
      style: string; // The overall style (e.g., 'photographic', 'cartoon', 'anime', 'text-logo', 'pixel-art')
      accessory: string; // The most prominent accessory (e.g., 'glasses', 'hat', 'earring', 'none')
    };
    
    RULES:
    1.  If the image is just text, a logo, or abstract art, BE CREATIVE. Invent traits that fit its vibe.
    2.  Always return valid JSON. Do not write any text outside the JSON block.
    3.  Always fill all fields. Do not use 'unknown' or 'N/A'.
    
    Example for a cat photo:
    {"description": "a fluffy cat", "main_colors": ["#E0B88A", "#3C2A1E", "#FFFFFF"], "style": "photographic", "accessory": "whiskers"}
    
    Example for a text logo:
    {"description": "a tech logo", "main_colors": ["#0A74DA", "#FFFFFF", "#000000"], "style": "text-logo", "accessory": "glowing lines"}`;

    // Resmi URL'den alıp Base64'e çevirme
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    // Use v1 API endpoint directly (not v1beta)
    // Try different model names - v1 API uses different naming
    // Common models: gemini-pro, gemini-1.5-pro, gemini-1.5-flash-latest
    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    };

    // Try multiple model names in order of preference
    const modelNames = [
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.5-flash",
    ];

    let response: Response | null = null;
    let lastError: string | null = null;

    for (const modelName of modelNames) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
        
        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          console.log(`✅ Successfully used model: ${modelName}`);
          break;
        } else {
          const errorText = await response.text();
          lastError = `Model ${modelName}: ${response.status} ${errorText}`;
          console.warn(`⚠️ Model ${modelName} failed:`, lastError);
          response = null;
        }
      } catch (error) {
        lastError = `Model ${modelName}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.warn(`⚠️ Model ${modelName} error:`, lastError);
        response = null;
      }
    }

    if (!response || !response.ok) {
      console.error("Gemini API error - all models failed:", lastError);
      throw new Error(`Gemini API error: ${lastError || "All models failed"}`);
    }

    const result = await response.json();
    
    // Extract text from response
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.error("No text in Gemini response:", JSON.stringify(result));
      return DEFAULT_TRAITS;
    }
    
    // JSON'u temizle ve parse et
    const jsonText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsedTraits = JSON.parse(jsonText);

    return parsedTraits;

  } catch (error) {
    console.error("Vision AI error:", error);
    // Hata olursa varsayılan özellikleri döndür
    return DEFAULT_TRAITS;
  }
}