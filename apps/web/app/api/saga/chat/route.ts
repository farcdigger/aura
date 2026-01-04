/**
 * Saga Game Guide Chat endpoint
 * Handles chat messages with Daydreams API (OpenAI GPT-4o-mini)
 * Uses Loot Survivor 2 game guide system prompt
 * Tracks token usage and deducts from user balance
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { env } from "@/env.mjs";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SAGA_GAME_GUIDE_PROMPT } from "@/lib/saga-game-guide-prompt";
import { getTokenMultiplierForModel } from "@/lib/chat-prompts";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";

const DEFAULT_MODEL = "openai/gpt-4o-mini"; // Daydreams model name

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Calculate tokens from Daydreams response
 * Fallback estimation if usage data is missing
 */
function calculateTokensFromResponse(response: any): number {
  // Daydreams API should return usage information
  if (response?.usage?.total_tokens) {
    return response.usage.total_tokens;
  }
  
  // Fallback: estimate based on message length
  // Rough estimation: ~4 characters per token
  if (response?.choices?.[0]?.message?.content) {
    const content = response.choices[0].message.content;
    const estimatedTokens = Math.ceil(content.length / 4);
    console.warn("⚠️ Using fallback token estimation:", {
      contentLength: content.length,
      estimatedTokens,
      note: "Daydreams API did not return usage data",
    });
    return estimatedTokens;
  }
  
  console.warn("⚠️ Could not calculate tokens - no usage data and no content");
  return 0;
}

/**
 * POST - Send chat message for Saga Game Guide
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, message, conversationHistory } = body;

    if (!walletAddress || !message) {
      return NextResponse.json(
        { error: "Missing walletAddress or message" },
        { status: 400 }
      );
    }

    // Check token balance and points from database
    const { isMockMode } = await import("@/env.mjs");
    
    let currentBalance = 0;
    let currentPoints = 0;
    try {
      if (isMockMode) {
        const { getMockTokenBalances } = await import("@/lib/chat-tokens-mock");
        const mockTokenBalances = getMockTokenBalances();
        const userData = mockTokenBalances.get(walletAddress.toLowerCase()) || { balance: 0, points: 0 };
        currentBalance = userData.balance;
        currentPoints = userData.points;
      } else {
        const result = await db
          .select()
          .from(chat_tokens)
          .where(eq(chat_tokens.wallet_address, walletAddress.toLowerCase()))
          .limit(1);
        
        if (result && result.length > 0) {
          currentBalance = Number(result[0].balance) || 0;
          currentPoints = Number(result[0].points) || 0;
        }
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
      currentBalance = 0;
      currentPoints = 0;
    }
    
    if (currentBalance <= 0) {
      return NextResponse.json(
        {
          error: "Insufficient tokens",
          paymentRequired: true,
        },
        { status: 402 }
      );
    }

    // Build messages array with game guide system prompt
    const messages: ChatMessage[] = [];
    
    if (!conversationHistory || conversationHistory.length === 0) {
      // New chat - add system prompt
      messages.push({
        role: "system",
        content: SAGA_GAME_GUIDE_PROMPT,
      });
    } else {
      // Existing conversation - reconstruct with system prompt at start
      messages.push({
        role: "system",
        content: SAGA_GAME_GUIDE_PROMPT,
      });
      
      // Add conversation history (excluding system messages)
      conversationHistory.forEach((msg: ChatMessage) => {
        if (msg.role !== "system") {
          messages.push(msg);
        }
      });
    }
    
    // Add current user message
    messages.push({
      role: "user",
      content: message,
    });

    // Call Daydreams API
    if (!env.INFERENCE_API_KEY) {
      return NextResponse.json(
        { error: "Daydreams API key not configured" },
        { status: 500 }
      );
    }

    // Retry configuration for Daydreams API
    const MAX_RETRIES = 2;
    const INITIAL_TIMEOUT = 60000; // 60 seconds
    let lastError: any = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const timeout = INITIAL_TIMEOUT + (attempt * 10000); // Increase timeout on retry
        
        if (attempt > 0) {
          console.log(`🔄 Retrying Daydreams API call (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
          // Exponential backoff: wait 2^attempt seconds
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
        
        const requestBody: any = {
          model: DEFAULT_MODEL,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: 0.7,
          max_tokens: 1000, // Reasonable limit for game guide responses
          stream: false,
        };
        
        const response = await axios.post(
          "https://api-beta.daydreams.systems/v1/chat/completions",
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${env.INFERENCE_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: timeout,
          }
        );
        
        // Success - break out of retry loop
        const assistantMessage = response.data.choices[0]?.message?.content;
        const usage = response.data.usage;

        if (!assistantMessage) {
          throw new Error("No response from Daydreams API");
        }

        // Calculate tokens used
        console.log("📊 Token usage from Daydreams API:", {
          usage,
          hasUsage: !!usage,
          totalTokens: usage?.total_tokens,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
        });
        
        const rawTokensUsed = usage?.total_tokens || calculateTokensFromResponse(response.data);
        
        if (rawTokensUsed === 0) {
          console.warn("⚠️ Warning: rawTokensUsed is 0, this might indicate an issue with token calculation");
        }
        
        // Apply model-based token multiplier for credit calculation
        const tokenMultiplier = getTokenMultiplierForModel(DEFAULT_MODEL);
        const creditsToDeduct = Math.ceil(rawTokensUsed * tokenMultiplier);
        
        // Deduct credits from balance in database (using multiplier-adjusted amount)
        const newBalance = Math.max(0, currentBalance - creditsToDeduct);
        
        console.log("💰 Balance update (saga chat):", {
          walletAddress: walletAddress.substring(0, 10) + "...",
          rawTokensUsed,
          tokenMultiplier,
          creditsToDeduct,
          currentBalance,
          newBalance,
        });
        
        // Calculate points: every 2,000 tokens spent = 1 point
        let totalTokensSpent = 0;
        let newPoints = currentPoints;
        
        if (isMockMode) {
          const { getMockTokenBalances } = await import("@/lib/chat-tokens-mock");
          const mockTokenBalances = getMockTokenBalances();
          const userData = mockTokenBalances.get(walletAddress.toLowerCase()) || { balance: 0, points: 0, totalTokensSpent: 0 };
          totalTokensSpent = (userData.totalTokensSpent || 0) + rawTokensUsed;
          newPoints = Math.floor(totalTokensSpent / 2000);
          
          mockTokenBalances.set(walletAddress.toLowerCase(), {
            balance: newBalance,
            points: newPoints,
            totalTokensSpent: totalTokensSpent,
          });
        } else {
          const result = await db
            .select()
            .from(chat_tokens)
            .where(eq(chat_tokens.wallet_address, walletAddress.toLowerCase()))
            .limit(1);
          
          const currentTotalSpent = result && result.length > 0
            ? Number(result[0].total_tokens_spent) || 0
            : 0;
          
          totalTokensSpent = currentTotalSpent + rawTokensUsed;
          newPoints = Math.floor(totalTokensSpent / 2000);
        }
        
        // Update balance, points, and total_tokens_spent in database
        // CRITICAL: Pass creditsToDeduct to enable atomic decrement (prevents race condition with top-ups)
        await updateTokenBalance(walletAddress, newBalance, newPoints, totalTokensSpent, creditsToDeduct);

        // Check if balance is low
        if (newBalance <= 0) {
          return NextResponse.json({
            response: assistantMessage,
            tokensUsed: creditsToDeduct,
            rawTokensUsed: rawTokensUsed,
            tokenMultiplier: tokenMultiplier,
            newBalance: newBalance,
            points: newPoints,
            lowBalance: true,
          });
        }

        // Return response with credit information
        return NextResponse.json({
          response: assistantMessage,
          tokensUsed: creditsToDeduct,
          rawTokensUsed: rawTokensUsed,
          tokenMultiplier: tokenMultiplier,
          newBalance: newBalance,
          points: newPoints,
        });
      } catch (error: any) {
        lastError = error;
        console.error(`Daydreams API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, {
          message: error.message,
          code: error.code,
          timeout: error.code === "ECONNABORTED",
        });
        
        // If payment required, don't retry
        if (error.response?.status === 402) {
          return NextResponse.json(
            {
              error: "Payment required for Daydreams API",
              paymentRequired: true,
            },
            { status: 402 }
          );
        }
        
        // If this was the last attempt, throw the error
        if (attempt === MAX_RETRIES) {
          // Return user-friendly error message for timeout
          if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
            return NextResponse.json(
              {
                error: "The AI service is taking longer than expected. Please try again in a moment.",
                timeout: true,
              },
              { status: 504 }
            );
          }
          
          throw error;
        }
      }
    }
    
    // If we get here, all retries failed
    return NextResponse.json(
      {
        error: "Failed to get response from AI service after multiple attempts. Please try again later.",
        timeout: true,
      },
      { status: 504 }
    );
  } catch (error: any) {
    console.error("Error in saga chat endpoint:", error);
    console.error("Detailed error:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
    });
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

