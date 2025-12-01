import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export const runtime = "nodejs";

type RaydiumAgentInput = {
  poolAddress?: string;
  poolAddresses?: string[];
  numberOfPools?: number;
  skipTopPools?: number;
  hours?: number;
  transactionLimitPerPool?: number;
};

async function triggerRaydiumAgent(input?: RaydiumAgentInput) {
  if (!env.YAMA_AGENT_TRIGGER_URL) {
    return NextResponse.json(
      { error: "YAMA_AGENT_TRIGGER_URL is not configured" },
      { status: 500 },
    );
  }

  // Build the Raydium entrypoint URL
  const baseUrl = env.YAMA_AGENT_TRIGGER_URL.replace(
    '/entrypoints/fetch-and-analyze-raw/invoke',
    '/entrypoints/fetch-and-analyze-raydium/invoke'
  );

  const targetUrl = new URL(baseUrl);

  // Add query parameters if provided
  if (input?.poolAddress) {
    targetUrl.searchParams.set("poolAddress", input.poolAddress);
  }
  if (input?.poolAddresses && input.poolAddresses.length > 0) {
    targetUrl.searchParams.set("poolAddresses", input.poolAddresses.join(','));
  }
  if (input?.numberOfPools) {
    targetUrl.searchParams.set("numberOfPools", String(input.numberOfPools));
  }
  if (input?.skipTopPools) {
    targetUrl.searchParams.set("skipTopPools", String(input.skipTopPools));
  }
  if (input?.hours) {
    targetUrl.searchParams.set("hours", String(input.hours));
  }
  if (input?.transactionLimitPerPool) {
    targetUrl.searchParams.set("transactionLimitPerPool", String(input.transactionLimitPerPool));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (env.YAMA_AGENT_TRIGGER_TOKEN) {
    headers.Authorization = `Bearer ${env.YAMA_AGENT_TRIGGER_TOKEN}`;
  }

  try {
    // Use POST method with body for better parameter handling
    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: input || {},
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Raydium Agent trigger failed",
          status: response.status,
          body,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "Raydium Agent trigger dispatched",
        status: response.status,
        body: JSON.parse(body),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/raydium-agent/run] trigger error:", err);
    return NextResponse.json(
      { error: "Failed to trigger Raydium Agent" },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint - For manual triggering during development
 * Usage: /api/raydium-agent/run?poolAddress=xxx&hours=12
 */
export async function GET(request: Request) {
  // During development, allow manual triggering without auth
  // In production, you might want to add authentication here
  
  const url = new URL(request.url);
  const poolAddress = url.searchParams.get("poolAddress") || undefined;
  const poolAddresses = url.searchParams.get("poolAddresses")
    ? url.searchParams.get("poolAddresses")!.split(',').filter(Boolean)
    : undefined;
  const numberOfPools = url.searchParams.get("numberOfPools")
    ? Number(url.searchParams.get("numberOfPools"))
    : undefined;
  const skipTopPools = url.searchParams.get("skipTopPools")
    ? Number(url.searchParams.get("skipTopPools"))
    : undefined;
  const hours = url.searchParams.get("hours") ? Number(url.searchParams.get("hours")) : undefined;
  const transactionLimitPerPool = url.searchParams.get("transactionLimitPerPool")
    ? Number(url.searchParams.get("transactionLimitPerPool"))
    : undefined;

  console.log("[api/raydium-agent/run] Manual trigger (GET):", {
    poolAddress,
    poolAddresses,
    numberOfPools,
    skipTopPools,
    hours,
    transactionLimitPerPool,
  });

  return triggerRaydiumAgent({
    poolAddress,
    poolAddresses,
    numberOfPools,
    skipTopPools,
    hours,
    transactionLimitPerPool,
  });
}

/**
 * POST endpoint - For manual triggering with JSON body
 * Usage: POST /api/raydium-agent/run with body: { poolAddress: "xxx", hours: 12 }
 */
export async function POST(request: Request) {
  // During development, allow manual triggering without auth
  // In production, you might want to add authentication here

  try {
    const input = await request.json().catch(() => ({})) as RaydiumAgentInput;
    
    console.log("[api/raydium-agent/run] Manual trigger (POST):", input);

    return triggerRaydiumAgent(input);
  } catch (err) {
    console.error("[api/raydium-agent/run] POST error:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}

