/**
 * Chat message endpoint
 * Handles chat messages with Daydreams API (OpenAI GPT-4o-mini)
 * Tracks token usage and deducts from user balance
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { env } from "@/env.mjs";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { generateSystemPrompt } from "@/lib/chat-prompt";
import { getSystemPromptForMode, getModelForMode, getTokenMultiplierForModel, type ChatMode } from "@/lib/chat-prompts";
import { updateTokenBalance } from "@/lib/chat-tokens-mock";

// Default model (will be overridden by getModelForMode based on chat mode)
const DEFAULT_MODEL = "openai/gpt-4o-mini"; // Daydreams model name (gpt-5-nano not available)

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Get NFT traits for wallet address
 * Gracefully handles errors - returns null if NFT not found or errors occur
 */
async function getNFTTraits(walletAddress: string): Promise<any | null> {
  try {
    // First, try to get token from contract
    const provider = new ethers.JsonRpcProvider(env.RPC_URL || "https://mainnet.base.org");
    const contractAddress = env.CONTRACT_ADDRESS || "0x7De68EB999A314A0f986D417adcbcE515E476396";
    
    // ERC721 ABI
    const ERC721_ABI = [
      "function balanceOf(address owner) external view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
      "function tokenURI(uint256 tokenId) external view returns (string)",
    ];
    
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // Check balance with timeout and error handling
    let balance;
    try {
      balance = await Promise.race([
        contract.balanceOf(walletAddress),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Balance check timeout")), 5000)
        ),
      ]) as bigint;
    } catch (balanceError: any) {
      // If rate limited or other RPC error, gracefully return null
      if (balanceError?.info?.error?.code === -32016 || balanceError?.code === "CALL_EXCEPTION") {
        console.warn("RPC rate limit or error checking NFT balance, using default traits:", balanceError.message);
        return null;
      }
      throw balanceError;
    }
    
    if (balance === 0n) {
      return null; // No NFT owned
    }
    
    // Get first token ID with error handling
    let tokenId;
    try {
      tokenId = await Promise.race([
        contract.tokenOfOwnerByIndex(walletAddress, 0),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Token ID check timeout")), 5000)
        ),
      ]) as bigint;
    } catch (tokenError: any) {
      // If require(false) or other contract error, user doesn't have NFT
      if (tokenError?.code === "CALL_EXCEPTION" || tokenError?.reason === "require(false)") {
        console.warn("User does not own NFT (contract revert), using default traits");
        return null;
      }
      // If rate limited, gracefully return null
      if (tokenError?.info?.error?.code === -32016) {
        console.warn("RPC rate limit checking token ID, using default traits");
        return null;
      }
      throw tokenError;
    }
    
    // Try to get traits from database
    if (db) {
      try {
        const tokenRows = await db
          .select()
          .from(tokens)
          .where(eq(tokens.token_id, Number(tokenId)))
          .limit(1);
        
        if (tokenRows && tokenRows.length > 0 && tokenRows[0].traits) {
          return tokenRows[0].traits;
        }
      } catch (dbError) {
        console.warn("Database lookup failed, using default traits:", dbError);
      }
    }
    
    // If not in database, return null to use default traits
    return null;
  } catch (error: any) {
    // Log error but don't fail the request - use default traits instead
    console.warn("Error getting NFT traits (using default):", error?.message || error);
    return null;
  }
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
 * POST - Send chat message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, message, conversationHistory, nftTraits: providedTraits, chatMode } = body;

    if (!walletAddress || !message) {
      return NextResponse.json(
        { error: "Missing walletAddress or message" },
        { status: 400 }
      );
    }

    // Check token balance and points from database
    const { db, chat_tokens } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
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

    // Determine chat mode (default to "default" if not provided)
    const mode: ChatMode = (chatMode as ChatMode) || "default";
    
    // Get NFT traits for system prompt (only needed for default mode)
    let nftTraits = providedTraits;
    if (mode === "default" && !nftTraits) {
      // Only fetch if not provided (shouldn't happen in normal flow, but fallback)
      nftTraits = await getNFTTraits(walletAddress);
    }
    
    // Generate system prompt based on mode
    let systemPrompt: string;
    if (mode === "default") {
      // For default mode, use NFT traits
      const defaultTraits = {
        description: "a mysterious digital entity",
        main_colors: ["#000000", "#FFFFFF"],
        style: "digital-art",
        accessory: "glowing aura",
      };
      const traits = nftTraits || defaultTraits;
      systemPrompt = getSystemPromptForMode(mode, traits);
    } else {
      // For other modes (chain-of-thought), traits not needed
      systemPrompt = getSystemPromptForMode(mode);
    }

    // Build messages array
    // If conversationHistory is empty, this is a new chat - start with system prompt
    const messages: ChatMessage[] = [];
    
    if (!conversationHistory || conversationHistory.length === 0) {
      // New chat - add system prompt
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    } else {
      // Existing conversation - reconstruct with system prompt at start
      messages.push({
        role: "system",
        content: systemPrompt,
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
    const INITIAL_TIMEOUT = 60000; // 60 seconds (increased from 30 - API needs more time)
    let lastError: any = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const timeout = INITIAL_TIMEOUT + (attempt * 10000); // Increase timeout on retry (10s per attempt: 60s, 70s, 80s)
        
        if (attempt > 0) {
          console.log(`🔄 Retrying Daydreams API call (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
          // Exponential backoff: wait 2^attempt seconds
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
        
        // Adjust max_tokens and temperature based on chat mode
        // CoT and data-visualization modes need more tokens for longer, detailed responses
        const maxTokens = (mode === "chain-of-thought" || mode === "data-visualization") ? 4000 : 500;
        const temperature = (mode === "chain-of-thought" || mode === "data-visualization") ? 0.8 : 0.7;
        
        // Use optimized model for each mode (Claude for SVG generation, GPT-4o-mini for default)
        const model = getModelForMode(mode);
        
        const requestBody: any = {
          model: model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: temperature, // Higher temp for creative modes
          max_tokens: maxTokens,
          stream: false, // Explicitly disable streaming for now
        };
        
        const response = await axios.post(
          "https://api-beta.daydreams.systems/v1/chat/completions",
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${env.INFERENCE_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: timeout, // 60 seconds initial timeout (with retry increases: 60s, 70s, 80s)
          }
        );
        
        // Success - break out of retry loop
        const assistantMessage = response.data.choices[0]?.message?.content;
        const usage = response.data.usage;

        if (!assistantMessage) {
          throw new Error("No response from Daydreams API");
        }

        // Calculate tokens used
        // Log usage for debugging
        console.log("📊 Token usage from Daydreams API:", {
          usage,
          hasUsage: !!usage,
          totalTokens: usage?.total_tokens,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          mode,
        });
        
        const rawTokensUsed = usage?.total_tokens || calculateTokensFromResponse(response.data);
        
        if (rawTokensUsed === 0) {
          console.warn("⚠️ Warning: rawTokensUsed is 0, this might indicate an issue with token calculation");
        }
        
        // Apply model-based token multiplier for credit calculation
        const tokenMultiplier = getTokenMultiplierForModel(model);
        const creditsToDeduct = Math.ceil(rawTokensUsed * tokenMultiplier);
        
        // Deduct credits from balance in database (using multiplier-adjusted amount)
        const newBalance = Math.max(0, currentBalance - creditsToDeduct);
        
        console.log("💰 Balance update (with model multiplier):", {
          walletAddress: walletAddress.substring(0, 10) + "...",
          mode,
          model,
          rawTokensUsed,
          tokenMultiplier,
          creditsToDeduct,
          currentBalance,
          newBalance,
        });
        
        // Calculate points: every 2,000 tokens spent = 1 point
        // We need to track total tokens spent across all messages
        let totalTokensSpent = 0;
        let newPoints = currentPoints;
        
        if (isMockMode) {
          const { getMockTokenBalances } = await import("@/lib/chat-tokens-mock");
          const mockTokenBalances = getMockTokenBalances();
          const userData = mockTokenBalances.get(walletAddress.toLowerCase()) || { balance: 0, points: 0, totalTokensSpent: 0 };
          // For points calculation, use raw tokens (not multiplied)
          totalTokensSpent = (userData.totalTokensSpent || 0) + rawTokensUsed;
          // Calculate points based on total tokens spent: every 2,000 tokens = 1 point
          newPoints = Math.floor(totalTokensSpent / 2000);
          
          console.log("🎯 Points calculation (mock mode):", {
            rawTokensUsed,
            previousTotalSpent: userData.totalTokensSpent || 0,
            totalTokensSpent,
            newPoints,
            formula: `Math.floor(${totalTokensSpent} / 2000) = ${newPoints}`,
          });
          
          // Update totalTokensSpent in mock storage
          mockTokenBalances.set(walletAddress.toLowerCase(), {
            balance: newBalance,
            points: newPoints,
            totalTokensSpent: totalTokensSpent,
          });
        } else {
          // For database mode, get current total_tokens_spent and update it
          const result = await db
            .select()
            .from(chat_tokens)
            .where(eq(chat_tokens.wallet_address, walletAddress.toLowerCase()))
            .limit(1);
          
          const currentTotalSpent = result && result.length > 0
            ? Number(result[0].total_tokens_spent) || 0
            : 0;
          
          // For points calculation, use raw tokens (not multiplied)
          totalTokensSpent = currentTotalSpent + rawTokensUsed;
          // Calculate points based on total tokens spent: every 2,000 tokens = 1 point
          newPoints = Math.floor(totalTokensSpent / 2000);
          
          console.log("🎯 Points calculation:", {
            rawTokensUsed,
            currentTotalSpent,
            totalTokensSpent,
            newPoints,
            formula: `Math.floor(${totalTokensSpent} / 2000) = ${newPoints}`,
          });
        }
        
        // Update balance, points, and total_tokens_spent in database
        console.log("💾 Updating token balance with points:", {
          walletAddress,
          newBalance,
          newPoints,
          totalTokensSpent,
          pointsFormula: `${totalTokensSpent} / 2000 = ${newPoints} points`,
        });
        await updateTokenBalance(walletAddress, newBalance, newPoints, totalTokensSpent);

        // Check if balance is low
        if (newBalance <= 0) {
          // Return response but indicate low balance
          // Note: tokensUsed in response is actually creditsToDeduct (multiplier applied)
          return NextResponse.json({
            response: assistantMessage,
            tokensUsed: creditsToDeduct, // Credits deducted (raw tokens × multiplier)
            rawTokensUsed: rawTokensUsed, // Actual tokens used (for transparency)
            tokenMultiplier: tokenMultiplier, // Multiplier applied
            newBalance: newBalance,
            points: newPoints,
            lowBalance: true,
        });
      }

        // Return response with credit information
        // Note: tokensUsed in response is actually creditsToDeduct (multiplier applied)
        return NextResponse.json({
          response: assistantMessage,
          tokensUsed: creditsToDeduct, // Credits deducted (raw tokens × multiplier)
          rawTokensUsed: rawTokensUsed, // Actual tokens used (for transparency)
          tokenMultiplier: tokenMultiplier, // Multiplier applied
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
    console.error("Error in chat message endpoint:", error);
    // Log detailed error for debugging
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

