import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 12000;

async function triggerAgent(limit?: number) {
  if (!env.YAMA_AGENT_TRIGGER_URL) {
    return NextResponse.json(
      { error: "YAMA_AGENT_TRIGGER_URL is not configured" },
      { status: 500 },
    );
  }

  const targetUrl = new URL(env.YAMA_AGENT_TRIGGER_URL);
  const limitValue = limit ?? DEFAULT_LIMIT;

  if (!targetUrl.searchParams.has("limitPerProtocol")) {
    targetUrl.searchParams.set("limitPerProtocol", String(limitValue));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (env.YAMA_AGENT_TRIGGER_TOKEN) {
    headers.Authorization = `Bearer ${env.YAMA_AGENT_TRIGGER_TOKEN}`;
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: targetUrl.searchParams.size > 0 ? "GET" : "POST",
      headers,
    });

    const body = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Agent trigger failed",
          status: response.status,
          body,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "Yama Agent trigger dispatched",
        status: response.status,
        body,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/yama-agent/run] trigger error:", err);
    return NextResponse.json(
      { error: "Failed to trigger Yama Agent" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  // Check if Yama Agent is enabled
  const isEnabled = env.YAMA_AGENT_ENABLED === "true";
  if (!isEnabled) {
    console.log("[api/yama-agent/run] ⏸️ Yama Agent is disabled (YAMA_AGENT_ENABLED=false)");
    return NextResponse.json(
      { 
        message: "Yama Agent is currently disabled for maintenance.",
        enabled: false 
      },
      { status: 200 },
    );
  }

  // Security: Vercel cron jobs send Authorization: Bearer ${CRON_SECRET}
  // According to Vercel docs: https://vercel.com/docs/cron-jobs
  const authHeader = request.headers.get("authorization");
  
  // Check if request is from Vercel cron job
  const isVercelCron = env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;
  
  if (!isVercelCron) {
    console.log("[api/yama-agent/run] Unauthorized access attempt blocked", {
      hasAuthHeader: !!authHeader,
      hasCronSecret: !!env.CRON_SECRET,
      authHeaderValue: authHeader?.substring(0, 30),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(
      { error: "Unauthorized. This endpoint is only accessible via scheduled cron jobs." },
      { status: 401 },
    );
  }
  
  console.log("[api/yama-agent/run] ✅ Authorized trigger: Vercel Cron");
  
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  return triggerAgent(limit);
}

export async function POST(request: Request) {
  // Check if Yama Agent is enabled
  const isEnabled = env.YAMA_AGENT_ENABLED === "true";
  if (!isEnabled) {
    console.log("[api/yama-agent/run] ⏸️ Yama Agent is disabled (YAMA_AGENT_ENABLED=false)");
    return NextResponse.json(
      { 
        message: "Yama Agent is currently disabled for maintenance.",
        enabled: false 
      },
      { status: 200 },
    );
  }

  // Security: Vercel cron jobs send Authorization: Bearer ${CRON_SECRET}
  const authHeader = request.headers.get("authorization");
  
  const isVercelCron = env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`;
  
  if (!isVercelCron) {
    console.log("[api/yama-agent/run] Unauthorized POST attempt blocked");
    return NextResponse.json(
      { error: "Unauthorized. This endpoint is only accessible via scheduled cron jobs." },
      { status: 401 },
    );
  }
  
  console.log("[api/yama-agent/run] ✅ Authorized POST trigger: Vercel Cron");
  
  const { limit } = await request.json().catch(() => ({ limit: undefined }));
  return triggerAgent(typeof limit === "number" ? limit : undefined);
}

