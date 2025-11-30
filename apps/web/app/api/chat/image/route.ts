import { NextRequest, NextResponse } from "next/server";
import axios, { AxiosError } from "axios";
import { randomUUID } from "crypto";
import { env, isMockMode } from "@/env.mjs";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getMockTokenBalances, updateTokenBalance } from "@/lib/chat-tokens-mock";

const DAYDREAMS_IMAGE_URL = "https://api-beta.daydreams.systems/v1/images/generations";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const IMAGE_CREDIT_COST = 80_000;
const TOKENS_PER_POINT = 2_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress = body.walletAddress?.toString().toLowerCase();
    const prompt = body.prompt?.toString().trim();

    if (!walletAddress || !prompt) {
      return NextResponse.json(
        { error: "walletAddress and prompt are required" },
        { status: 400 },
      );
    }

    if (!env.INFERENCE_API_KEY) {
      return NextResponse.json(
        { error: "Daydreams API key is not configured" },
        { status: 500 },
      );
    }

    // Fetch current balance, points and total tokens spent
    let currentBalance = 0;
    let currentTotalSpent = 0;

    if (isMockMode) {
      const mockBalances = getMockTokenBalances();
      const mockData = mockBalances.get(walletAddress) || {
        balance: 0,
        points: 0,
        totalTokensSpent: 0,
      };
      currentBalance = mockData.balance;
      currentTotalSpent = mockData.totalTokensSpent || 0;
    } else {
      try {
        const existing = await db
          .select()
          .from(chat_tokens)
          .where(eq(chat_tokens.wallet_address, walletAddress))
          .limit(1);

        if (existing && existing.length > 0) {
          currentBalance = Number(existing[0].balance) || 0;
          currentTotalSpent = Number(existing[0].total_tokens_spent) || 0;
        }
      } catch (error) {
        console.error("Failed to fetch chat token balance:", error);
      }
    }

    if (currentBalance < IMAGE_CREDIT_COST) {
      return NextResponse.json(
        {
          error: "Insufficient credits for image generation",
          requiredCredits: IMAGE_CREDIT_COST,
          currentBalance,
        },
        { status: 402 },
      );
    }

    // Call Daydreams Router for image generation
    const seed = randomUUID();
    let base64Image: string | null = null;

    try {
      const response = await axios.post(
        DAYDREAMS_IMAGE_URL,
        {
          model: IMAGE_MODEL,
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
          user: walletAddress,
          seed,
        },
        {
          headers: {
            Authorization: `Bearer ${env.INFERENCE_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 90_000,
        },
      );

      const imageData = response.data?.data?.[0];
      if (imageData?.b64_json) {
        base64Image = imageData.b64_json;
      } else if (imageData?.url) {
        if (imageData.url.startsWith("data:image")) {
          const encoded = imageData.url.split("base64,")?.[1];
          if (encoded) {
            base64Image = encoded;
          }
        } else {
          const imageResponse = await axios.get(imageData.url, { responseType: "arraybuffer" });
          base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");
        }
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 402) {
        return NextResponse.json(
          {
            error: "Daydreams account balance is insufficient for image generation",
            providerPaymentRequired: true,
          },
          { status: 502 },
        );
      }

      console.error("Daydreams image generation error:", axiosError.message);
      return NextResponse.json(
        { error: "Failed to generate image. Please try again later." },
        { status: 500 },
      );
    }

    if (!base64Image) {
      return NextResponse.json(
        { error: "Image data was not returned by Daydreams" },
        { status: 500 },
      );
    }

    const newBalance = currentBalance - IMAGE_CREDIT_COST;
    const newTotalSpent = currentTotalSpent + IMAGE_CREDIT_COST;
    const newPoints = Math.floor(newTotalSpent / TOKENS_PER_POINT);

    await updateTokenBalance(walletAddress, newBalance, newPoints, newTotalSpent);

    return NextResponse.json({
      imageUrl: `data:image/png;base64,${base64Image}`,
      newBalance,
      points: newPoints,
      cost: IMAGE_CREDIT_COST,
    });
  } catch (error: any) {
    console.error("Unexpected error in image generation route:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

