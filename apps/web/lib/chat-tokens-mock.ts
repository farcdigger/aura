/**
 * Chat tokens utility functions
 * Handles token balance, points, and mock storage
 */

import { db, chat_tokens } from "@/lib/db";
import { eq } from "drizzle-orm";
import { isMockMode } from "@/env.mjs";
import { isSupabaseConfigured } from "@/lib/db";

export interface MockUserData {
  balance: number;
  points: number;
  totalTokensSpent?: number; // Track total tokens spent for points calculation
}

export function getMockTokenBalances(): Map<string, MockUserData> {
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
}

// Helper function to update token balance in database
export async function updateTokenBalance(
  walletAddress: string,
  newBalance: number,
  newPoints?: number,
  totalTokensSpent?: number
): Promise<void> {
  const normalizedAddress = walletAddress.toLowerCase();
  const mockTokenBalances = getMockTokenBalances();

  console.log("💾 updateTokenBalance called:", {
    walletAddress: normalizedAddress,
    newBalance,
    newPoints,
    totalTokensSpent,
    isMockMode,
    isSupabaseConfigured,
  });

  if (isMockMode || !isSupabaseConfigured) {
    console.log("⚠️ Using mock mode - balance will not persist to Supabase");
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0, totalTokensSpent: 0 };
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: newPoints !== undefined ? newPoints : current.points,
      totalTokensSpent: totalTokensSpent !== undefined ? totalTokensSpent : (current.totalTokensSpent || 0),
    });
    return;
  }

  try {
    console.log("📊 Fetching existing record from Supabase...");
    // Try to update existing record
    const existing = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddress))
      .limit(1);

    const updateData: any = {
      balance: newBalance,
      updated_at: new Date().toISOString(),
    };
    
    // Always update points if provided (even if 0)
    if (newPoints !== undefined) {
      updateData.points = newPoints;
      console.log("⭐ Points will be updated to:", newPoints);
    } else {
      console.warn("⚠️ newPoints is undefined - points will not be updated");
    }
    
    // Always update total_tokens_spent if provided
    if (totalTokensSpent !== undefined) {
      updateData.total_tokens_spent = totalTokensSpent;
      console.log("📊 Total tokens spent will be updated to:", totalTokensSpent);
    } else {
      console.warn("⚠️ totalTokensSpent is undefined - total_tokens_spent will not be updated");
    }

    console.log("💾 Updating Supabase:", {
      walletAddress: normalizedAddress,
      updateData,
      exists: existing && existing.length > 0,
    });

    if (existing && existing.length > 0) {
      console.log("🔄 Updating existing record...");
      // Update existing record
      await db
        .update(chat_tokens)
        .set(updateData)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .execute();
      console.log("✅ Update successful!");
    } else {
      console.log("➕ Inserting new record...");
      // Insert new record
      await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: newPoints || 0,
        total_tokens_spent: totalTokensSpent || 0,
      });
      console.log("✅ Insert successful!");
    }
  } catch (dbError: any) {
    console.error("❌ Database error updating token balance:", {
      error: dbError.message,
      stack: dbError.stack,
      walletAddress: normalizedAddress,
      newBalance,
    });
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
  const mockTokenBalances = getMockTokenBalances();

  console.log("💰 addTokens called:", {
    walletAddress: normalizedAddress,
    amount,
    isMockMode,
    isSupabaseConfigured,
  });

  if (isMockMode || !isSupabaseConfigured) {
    console.log("⚠️ Using mock mode - tokens will not persist to Supabase");
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
    const newBalance = current.balance + amount;
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: current.points, // Preserve existing points
    });
    return newBalance;
  }

  try {
    console.log("📊 Fetching existing record from Supabase...");
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

    console.log("💾 Updating Supabase:", {
      walletAddress: normalizedAddress,
      currentBalance,
      amount,
      newBalance,
      currentPoints,
      exists: existing && existing.length > 0,
    });

    if (existing && existing.length > 0) {
      console.log("🔄 Updating existing record...");
      await db
        .update(chat_tokens)
        .set({
          balance: newBalance,
          points: currentPoints, // Preserve existing points
          updated_at: new Date().toISOString(),
        })
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .execute();
      console.log("✅ Update successful!");
    } else {
      console.log("➕ Inserting new record...");
      await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: 0,
        total_tokens_spent: 0,
      });
      console.log("✅ Insert successful!");
    }

    return newBalance;
  } catch (dbError: any) {
    console.error("❌ Database error adding tokens:", {
      error: dbError.message,
      stack: dbError.stack,
      walletAddress: normalizedAddress,
      amount,
    });
    // Fallback to mock storage
    console.warn("⚠️ Falling back to mock storage");
    const current = mockTokenBalances.get(normalizedAddress) || { balance: 0, points: 0 };
    const newBalance = current.balance + amount;
    mockTokenBalances.set(normalizedAddress, {
      balance: newBalance,
      points: current.points, // Preserve existing points
    });
    return newBalance;
  }
}

