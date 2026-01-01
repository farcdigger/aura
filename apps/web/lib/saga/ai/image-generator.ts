// src/lib/ai/image-generator.ts

import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!
});

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN is not set in environment variables');
}

export interface ImageGenerationResult {
  url: string;
  seed: number;
  processingTimeMs: number;
}

/**
 * FLUX.1 [dev] ile görsel üretir
 */
export async function generateImage(
  prompt: string,
  options: {
    seed?: number;
    aspectRatio?: '1:1' | '16:9' | '9:16';
    numOutputs?: number;
  } = {}
): Promise<ImageGenerationResult> {
  const startTime = Date.now();

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: enhancePrompt(prompt),
          width: 1024,
          height: 1024,
          num_outputs: options.numOutputs || 1,
          guidance_scale: 3.5, // Prompt adherence
          num_inference_steps: 28, // Kalite vs Hız dengesi
          seed: options.seed || Math.floor(Math.random() * 1000000),
          output_format: "webp", // Daha küçük dosya
          output_quality: 90
        }
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Invalid image URL returned from Replicate');
    }

    return {
      url: imageUrl as string,
      seed: options.seed || 0,
      processingTimeMs: Date.now() - startTime
    };

  } catch (error: any) {
    console.error('Image generation error:', error);
    
    // Check for rate limit error (429)
    if (error.status === 429 || 
        error.message?.includes('429') || 
        error.message?.includes('rate limit') ||
        error.message?.includes('Too Many Requests')) {
      
      // Try to extract retry_after from error response
      let retryAfter = 10; // Default 10 seconds
      
      // Check response headers
      if (error.response?.headers) {
        const retryAfterHeader = error.response.headers.get?.('retry-after') || 
                                error.response.headers['retry-after'];
        if (retryAfterHeader) {
          retryAfter = parseInt(retryAfterHeader) || 10;
        }
      }
      
      // Try to parse from error message (JSON format)
      try {
        const errorDetail = error.message?.match(/"retry_after":\s*(\d+)/);
        if (errorDetail) {
          retryAfter = parseInt(errorDetail[1]) || 10;
        }
      } catch (e) {
        // Ignore parse errors
      }
      
      // Create a custom error with retry_after info
      const rateLimitError: any = new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
      rateLimitError.status = 429;
      rateLimitError.retryAfter = retryAfter;
      throw rateLimitError;
    }
    
    throw new Error(`Failed to generate image: ${error.message}`);
  }
}

/**
 * Prompt'u FLUX için optimize eder - Siyah-Beyaz Kara Kalem Çizimi
 */
function enhancePrompt(basePrompt: string): string {
  const styleModifiers = [
    'black and white',
    'pen and ink drawing',
    'line art only',
    'detailed linework',
    'intricate line art',
    'fine line details',
    'crosshatching',
    'hatching techniques',
    'stippling',
    'detailed crosshatching patterns',
    'precise line work',
    'technical drawing style',
    'architectural line drawing',
    'comic book illustration',
    'classic comic book style',
    'monochrome',
    'no colors',
    'grayscale',
    'only lines and shadows',
    'no fill colors',
    'line-based illustration',
    'dramatic shadows created with lines',
    'high contrast line art',
    'motion lines',
    'speed effects',
    'action-packed',
    'dynamic composition',
    'professional comic book art',
    '1024x1024 resolution',
    'NO speech bubbles or text in images',
    'NO solid fills',
    'ONLY lines and crosshatching',
    'detailed pen and ink style',
    'intricate line patterns'
  ].join(', ');

  return `${basePrompt}, ${styleModifiers}`;
}

/**
 * Comic page için prompt oluştur (grid layout, 4 panel)
 * NO speech bubbles in images - text will be shown below
 * Her panel FARKLI sahne olmalı - MANDATORY
 */
function createComicPagePrompt(panels: Array<{ speechBubble: string; imagePrompt: string }>): string {
  const gridLayout = '2x2 grid'; // Her zaman 4 panel (2x2)
  
  const panelDescriptions = panels.map((panel: any, i: number) => {
    // Panel prompt'undan "speech bubble" kısmını çıkar (görselde olmayacak)
    let cleanPrompt = panel.imagePrompt
      .replace(/speech bubble[^,]*/gi, '')
      .replace(/speech bubbles visible/gi, '')
      .replace(/no speech bubbles/gi, '')
      .replace(/speech bubble/gi, '')
      .trim();
    
    // Panel pozisyonu
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const position = positions[i] || `position ${i + 1}`;
    
    // Her panelin MUTLAKA FARKLI olduğunu vurgula - çok agresif
    // Her panel farklı bir senaryo, farklı bir hikaye anı olmalı
    return `Panel ${i + 1} (${position}): ${cleanPrompt}, THIS PANEL MUST BE COMPLETELY DIFFERENT FROM ALL OTHER PANELS - DIFFERENT monster/enemy, DIFFERENT action/scenario, DIFFERENT location/environment, DIFFERENT composition, DIFFERENT camera angle/perspective, DIFFERENT moment in story, UNIQUE scene, each panel tells a different part of the story, dynamic action, motion lines, speed effects, dramatic shadows`;
  }).join(' | ');

  return `Professional comic book page, ${gridLayout} layout with exactly ${panels.length} COMPLETELY DISTINCT AND UNIQUE panels, black and white pen and ink drawing, line art only, detailed linework, intricate crosshatching, fine line details, stippling, precise line work, technical drawing style, MANDATORY: each panel shows a COMPLETELY DIFFERENT scene with DIFFERENT monster/enemy, DIFFERENT action, DIFFERENT location, DIFFERENT composition, DIFFERENT camera angle, dynamic action scenes with motion lines and speed effects, dramatic shadows created with lines and crosshatching, high contrast line art, each panel clearly separated with thick black borders (3-5px), panels arranged in a perfect grid format, NO REPEATED SCENES OR SIMILAR COMPOSITIONS: ${panelDescriptions}, detailed linework, intricate hatching and crosshatching techniques, stippling for texture, dramatic composition, monochrome, no colors, grayscale, ONLY lines and shadows, NO solid fills, line-based illustration, 1024x1024 resolution, professional comic book page layout, NO speech bubbles or text in images, each panel must be visually distinct and unique, classic comic book illustration style, action-packed scenes, detailed pen and ink style, intricate line patterns`;
}

/**
 * Comic page görseli üretir (tek görselde 4-5 panel)
 */
export async function generateComicPage(
  panels: Array<{ speechBubble: string; imagePrompt: string }>,
  characterSeed?: number,
  customPrompt?: string // Eğer prompt zaten oluşturulmuşsa kullan
): Promise<ImageGenerationResult> {
  // Eğer custom prompt varsa onu kullan, yoksa panels'den oluştur
  const pagePrompt = customPrompt || createComicPagePrompt(panels);
  
  return generateImage(pagePrompt, {
    seed: characterSeed,
    aspectRatio: '1:1' // Square format for comic page
  });
}

/**
 * Comic pages üretir (her sayfa tek görsel, 4-5 panel içerir)
 */
export async function generateComicPages(
  pages: Array<{ 
    panels: Array<{ speechBubble: string; imagePrompt: string }>;
    imagePrompt?: string; // Optional: pre-generated page prompt
  }>,
  characterSeed?: number,
  onProgress?: (currentIndex: number, total: number) => Promise<void>
): Promise<ImageGenerationResult[]> {
  const results: ImageGenerationResult[] = [];
  
    // Sequential generation (rate limit için)
    // Replicate free tier: 6 requests/minute = 10s/request minimum
    // We use 12s between requests to be safe
    for (let i = 0; i < pages.length; i++) {
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0) {
        try {
          // Rate limit için delay (ilk request hariç)
          // Minimum 12 seconds between requests (6 requests/minute = 10s/request, we use 12s for safety)
          if (i > 0) {
            console.log(`[Image Generator] Waiting 12s before generating page ${i + 1}/${pages.length} (rate limit protection)...`);
            await new Promise(resolve => setTimeout(resolve, 12000));
          }
        
        // Eğer page'de imagePrompt varsa onu kullan (scene-extractor'dan geliyor)
        const result = await generateComicPage(
          pages[i].panels, 
          characterSeed ? characterSeed + i : undefined,
          pages[i].imagePrompt // Custom prompt if available
        );
        results.push(result);
        console.log(`[Image Generator] Generated comic page ${i + 1}/${pages.length} (${pages[i].panels.length} panels)`);
        
        if (onProgress) {
          await onProgress(i + 1, pages.length);
        }
        
        break;
      } catch (error: any) {
        lastError = error;
        
        if (error.status === 429 || 
            error.message?.includes('429') || 
            error.message?.includes('rate limit') ||
            error.message?.includes('Too Many Requests')) {
          
          // Extract retry_after from error
          let retryAfter = error.retryAfter || 10;
          
          // Try response headers
          if (!retryAfter && error.response?.headers) {
            retryAfter = parseInt(error.response.headers.get?.('retry-after') || 
                                 error.response.headers['retry-after'] || '10') || 10;
          }
          
          // Try to parse from error message
          if (!retryAfter) {
            try {
              const match = error.message?.match(/"retry_after":\s*(\d+)/);
              if (match) {
                retryAfter = parseInt(match[1]) || 10;
              }
            } catch (e) {
              // Ignore
            }
          }
          
          // Add extra buffer (2 seconds) to avoid hitting limit again
          retryAfter = Math.max(retryAfter + 2, 12);
          
          console.warn(`[Image Generator] Rate limit hit (page ${i + 1}/${pages.length}), waiting ${retryAfter}s before retry... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          retries--;
        } else {
          console.error(`[Image Generator] Non-retryable error for page ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    if (retries === 0 && lastError) {
      throw new Error(`Failed to generate comic page ${i + 1} after 3 retries: ${lastError.message}`);
    }
  }

  return results;
}

/**
 * Batch image generation (Sequential - Rate limit için)
 * Replicate free tier: 6 requests/minute, burst: 1
 * Sequential generation rate limit'i aşmamak için
 * @deprecated Use generateComicPages instead for comic book format
 */
export async function generateImages(
  prompts: string[],
  characterSeed?: number, // Tutarlılık için
  onProgress?: (currentIndex: number, total: number) => Promise<void> // Progress callback
): Promise<ImageGenerationResult[]> {
  const results: ImageGenerationResult[] = [];
  
  // Sequential generation (rate limit için)
  for (let i = 0; i < prompts.length; i++) {
    let retries = 3;
    let lastError: any = null;
    
    while (retries > 0) {
      try {
        // Rate limit için delay (ilk request hariç)
        if (i > 0) {
          // Her request arasında 10 saniye bekle (rate limit: 6/min = 10s/request)
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        const result = await generateImage(prompts[i], {
          seed: characterSeed ? characterSeed + i : undefined
        });
        
        results.push(result);
        console.log(`[Image Generator] Generated image ${i + 1}/${prompts.length}`);
        
        // Progress callback'i çağır
        if (onProgress) {
          await onProgress(i + 1, prompts.length);
        }
        
        break; // Başarılı, retry loop'tan çık
        
      } catch (error: any) {
        lastError = error;
        
        // 429 Rate Limit hatası
        if (error.message?.includes('429') || 
            error.message?.includes('rate limit') ||
            error.message?.includes('Too Many Requests') ||
            error.status === 429) {
          
          // Retry-after header'ından veya error mesajından al
          let retryAfter = 10;
          if (error.response?.headers?.get?.('retry-after')) {
            retryAfter = parseInt(error.response.headers.get('retry-after')) || 10;
          } else if (error.response?.headers?.['retry-after']) {
            retryAfter = parseInt(error.response.headers['retry-after']) || 10;
          }
          
          console.warn(`[Image Generator] Rate limit hit (${i + 1}/${prompts.length}), waiting ${retryAfter}s before retry... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          retries--;
        } else {
          // Diğer hatalar için retry yok
          console.error(`[Image Generator] Non-retryable error for image ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    // Tüm retry'lar başarısız
    if (retries === 0 && lastError) {
      throw new Error(`Failed to generate image ${i + 1} after 3 retries: ${lastError.message}`);
    }
  }

  return results;
}

