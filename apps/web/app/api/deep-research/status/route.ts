/**
 * Deep Research - Analysis Status
 * 
 * Check the status of an analysis job
 */

import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId query parameter is required" },
        { status: 400 }
      );
    }

    console.log(`🔍 [Deep Research] Checking status for job: ${jobId}`);

    // Query Solana agent for job status
    const agentUrl = env.SOLANA_AGENT_URL || "http://localhost:3002";
    const response = await fetch(`${agentUrl}/api/status/${jobId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || "Failed to get job status" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      jobId,
      status: data.status, // "waiting" | "active" | "completed" | "failed"
      progress: data.progress, // 0-100
      result: data.result, // Analysis result if completed
      error: data.error, // Error message if failed
      createdAt: data.createdAt,
      completedAt: data.completedAt,
    });
  } catch (error: any) {
    console.error("❌ [Deep Research] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

