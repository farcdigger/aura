/**
 * Get token balance for a wallet
 */

import { NextRequest, NextResponse } from "next/server";
import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { isMockMode } from "@/env.mjs";

// Mock token balance and points storage (in-memory) - fallback for mock mode
// Use global to persist across API route requests in Next.js
interface MockUserData {
  balance: number;
  points: number;
  totalTokensSpent?: number; // Track total tokens spent for points calculation
}

const getMockTokenBalances = (): Map<string, MockUserData> => {
  if (typeof global !== 'undefined') {
    if (!(global as any).mockTokenBalances) {
      (global as any).mockTokenBalances = new Map<string, MockUserData>();
    }
    // Migrate old format (number) to new format (MockUserData)
    const map = (global as any).mockTokenBalances;
    map.forEach((value: any, key: string) => {
      if (typeof value === 'number') {
        map.set(key, { balance: value, points: 0, totalTokensSpent: 0 });
      }
    });
    return map;
  }
  // Fallback for environments without global
  if (!(globalThis as any).mockTokenBalances) {
    (globalThis as any).mockTokenBalances = new Map<string, MockUserData>();
  }
  // Migrate old format
  const map = (globalThis as any).mockTokenBalances;
  map.forEach((value: any, key: string) => {
    if (typeof value === 'number') {
      map.set(key, { balance: value, points: 0, totalTokensSpent: 0 });
    }
  });
  return map;
};

const mockTokenBalances = getMockTokenBalances();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("wallet");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing wallet parameter" },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    if (isMockMode) {
      // Mock mode: return in-memory balance and points
      const userData = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
      return NextResponse.json({ balance: userData.balance, points: userData.points });
    }

    // Database mode: query from chat_tokens table
    try {
      const result = await db
        .select()
        .from(chat_tokens)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .limit(1);

      if (result && result.length > 0) {
        return NextResponse.json({ 
          balance: Number(result[0].balance) || 0,
          points: Number(result[0].points) || 0,
        });
      }

      // No record found - create one with 0 balance, 0 points, and 0 total_tokens_spent
      await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: 0,
        points: 0,
        total_tokens_spent: 0,
      });

      return NextResponse.json({ balance: 0, points: 0 });
    } catch (dbError: any) {
      console.error("Database error fetching token balance:", dbError);
      // Fallback to mock storage if database fails
      const userData = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
      return NextResponse.json({ balance: userData.balance, points: userData.points });
    }
  } catch (error: any) {
    console.error("Error fetching token balance:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

// Helper function to update token balance in database
export async function updateTokenBalance(
  walletAddress: string,
  newBalance: number,
  newPoints?: number,
  totalTokensSpent?: number
): Promise<void> {
  const normalizedAddress = walletAddress.toLowerCase();

  if (isMockMode) {
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0, totalTokensSpent: 0 };
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: newPoints !== undefined ? newPoints : current.points,
      totalTokensSpent: totalTokensSpent !== undefined ? totalTokensSpent : (current.totalTokensSpent || 0),
    });
    return;
  }

  try {
    // Try to update existing record
    const existing = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddress))
      .limit(1);

    const updateData: any = {
      balance: newBalance,
      updated_at: new Date(),
    };
    
    if (newPoints !== undefined) {
      updateData.points = newPoints;
    }
    
    if (totalTokensSpent !== undefined) {
      updateData.total_tokens_spent = totalTokensSpent;
    }

    if (existing && existing.length > 0) {
      // Update existing record
      await db
        .update(chat_tokens)
        .set(updateData)
        .where(eq(chat_tokens.wallet_address, normalizedAddress));
    } else {
      // Insert new record
      await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: newPoints || 0,
        total_tokens_spent: totalTokensSpent || 0,
      });
    }
  } catch (dbError: any) {
    console.error("Database error updating token balance:", dbError);
    // Fallback to mock storage
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: newPoints !== undefined ? newPoints : current.points,
    });
  }
}

// Helper function to add tokens to balance (preserves existing points)
export async function addTokens(
  walletAddress: string,
  amount: number
): Promise<number> {
  const normalizedAddress = walletAddress.toLowerCase();

  if (isMockMode) {
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
    const newBalance = current.balance + amount;
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: current.points, // Preserve existing points
    });
    return newBalance;
  }

  try {
    const existing = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddress))
      .limit(1);

    const currentBalance = existing && existing.length > 0 
      ? Number(existing[0].balance) || 0 
      : 0;
    
    const currentPoints = existing && existing.length > 0
      ? Number(existing[0].points) || 0
      : 0;
    
    const newBalance = currentBalance + amount;

    if (existing && existing.length > 0) {
      await db
        .update(chat_tokens)
        .set({
          balance: newBalance,
          points: currentPoints, // Preserve existing points
          updated_at: new Date(),
        })
        .where(eq(chat_tokens.wallet_address, normalizedAddress));
    } else {
      await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: 0,
        total_tokens_spent: 0,
      });
    }

    return newBalance;
  } catch (dbError: any) {
    console.error("Database error adding tokens:", dbError);
    // Fallback to mock storage
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
    const newBalance = current.balance + amount;
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: current.points, // Preserve existing points
    });
    return newBalance;
  }
}

// Export mock storage for backward compatibility
export { mockTokenBalances };

