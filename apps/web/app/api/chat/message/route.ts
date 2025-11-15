/**
 * Chat message endpoint
 * Handles chat messages with Daydreams API (GPT-4o-mini)
 * Tracks token usage and deducts from user balance
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { env } from "@/env.mjs";
import { db, tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { generateSystemPrompt } from "@/lib/chat-prompt";
import { updateTokenBalance, addTokens } from "../token-balance/route";

const MODEL = "openai/gpt-4o-mini"; // Daydreams model name

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Get NFT traits for wallet address
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
    const balance = await contract.balanceOf(walletAddress);
    
    if (balance === 0n) {
      return null; // No NFT owned
    }
    
    // Get first token ID
    const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, 0);
    
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
  } catch (error) {
    console.error("Error getting NFT traits:", error);
    return null;
  }
}

/**
 * Calculate tokens from Daydreams response
 */
function calculateTokensFromResponse(response: any): number {
  // Daydreams API should return usage information
  // For now, estimate based on input/output tokens
  if (response.usage) {
    return response.usage.total_tokens || 0;
  }
  
  // Fallback: estimate based on message length
  // This is approximate - should use actual API response
  return 0;
}

/**
 * POST - Send chat message
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
    const { db, chat_tokens } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const { isMockMode } = await import("@/env.mjs");
    
    let currentBalance = 0;
    let currentPoints = 0;
    try {
      if (isMockMode) {
        const { mockTokenBalances } = await import("../token-balance/route");
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

    // Get NFT traits for system prompt
    const nftTraits = await getNFTTraits(walletAddress);
    
    // Generate system prompt based on NFT traits
    // If no traits found, use default
    const defaultTraits = {
      description: "a mysterious digital entity",
      main_colors: ["#000000", "#FFFFFF"],
      style: "digital-art",
      accessory: "glowing aura",
    };
    
    const traits = nftTraits || defaultTraits;
    const systemPrompt = generateSystemPrompt(traits);

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

    try {
      const response = await axios.post(
        "https://api-beta.daydreams.systems/v1/chat/completions",
        {
          model: MODEL,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: 0.7, // Slightly lower for faster responses
          max_tokens: 500, // Reduced from 1000 to speed up generation
          stream: false, // Explicitly disable streaming for now
        },
        {
          headers: {
            Authorization: `Bearer ${env.INFERENCE_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const assistantMessage = response.data.choices[0]?.message?.content;
      const usage = response.data.usage;

      if (!assistantMessage) {
        throw new Error("No response from Daydreams API");
      }

      // Calculate tokens used
      const tokensUsed = usage?.total_tokens || calculateTokensFromResponse(response.data);
      
      // Deduct tokens from balance in database
      const newBalance = Math.max(0, currentBalance - tokensUsed);
      
      // Calculate points: every 10,000 tokens spent = 1 point
      // We need to track total tokens spent across all messages
      let totalTokensSpent = 0;
      let newPoints = currentPoints;
      
      if (isMockMode) {
        const { mockTokenBalances } = await import("../token-balance/route");
        const userData = mockTokenBalances.get(walletAddress.toLowerCase()) || { balance: 0, points: 0, totalTokensSpent: 0 };
        totalTokensSpent = (userData.totalTokensSpent || 0) + tokensUsed;
        // Calculate points based on total tokens spent
        newPoints = Math.floor(totalTokensSpent / 10000);
        
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
        
        totalTokensSpent = currentTotalSpent + tokensUsed;
        // Calculate points based on total tokens spent
        newPoints = Math.floor(totalTokensSpent / 10000);
      }
      
      // Update balance, points, and total_tokens_spent in database
      await updateTokenBalance(walletAddress, newBalance, newPoints, totalTokensSpent);

      // Check if balance is low
      if (newBalance <= 0) {
        // Return response but indicate low balance
        return NextResponse.json({
          response: assistantMessage,
          tokensUsed,
          newBalance: newBalance,
          points: newPoints,
          lowBalance: true,
        });
      }

      return NextResponse.json({
        response: assistantMessage,
        tokensUsed,
        newBalance: newBalance,
        points: newPoints,
      });
    } catch (error: any) {
      console.error("Daydreams API error:", error);
      
      if (error.response?.status === 402) {
        return NextResponse.json(
          {
            error: "Payment required for Daydreams API",
            paymentRequired: true,
          },
          { status: 402 }
        );
      }

      throw error;
    }
  } catch (error: any) {
    console.error("Error in chat message endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

