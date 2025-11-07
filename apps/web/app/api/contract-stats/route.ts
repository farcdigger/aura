import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { env } from "@/env.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONTRACT_ABI = [
  "function getMintStats() external view returns (uint256 minted, uint256 remaining)",
  "function totalSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    const contract = new ethers.Contract(env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    let minted: bigint | undefined;
    let remaining: bigint | undefined;
    let maxSupply: bigint | undefined;

    try {
      const stats = await contract.getMintStats();
      // Support both tuple object with named keys and simple array
      if (Array.isArray(stats)) {
        minted = BigInt(stats[0]);
        remaining = BigInt(stats[1]);
      } else {
        minted = BigInt(stats.minted ?? 0);
        remaining = BigInt(stats.remaining ?? 0);
      }
    } catch {
      // Fallback for older contracts without getMintStats
      const total = await contract.totalSupply();
      const max = await contract.MAX_SUPPLY();
      minted = BigInt(total);
      maxSupply = BigInt(max);
      remaining = maxSupply - minted;
    }

    if (minted === undefined || remaining === undefined) {
      const total = await contract.totalSupply();
      const max = await contract.MAX_SUPPLY();
      minted = BigInt(total);
      maxSupply = BigInt(max);
      remaining = maxSupply - minted;
    }

    if (maxSupply === undefined) {
      const max = await contract.MAX_SUPPLY();
      maxSupply = BigInt(max);
    }

    if (minted === undefined || remaining === undefined || maxSupply === undefined) {
      throw new Error("Contract stats unavailable");
    }

    return NextResponse.json({
      minted: minted.toString(),
      remaining: remaining.toString(),
      maxSupply: maxSupply.toString(),
    });
  } catch (error) {
    console.error("❌ contract-stats error:", error);
    return NextResponse.json(
      {
        error: "Failed to load contract stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

