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
// If creditsToDeduct is provided, it will do atomic decrement (prevents race conditions with top-ups)
// Otherwise, it will set balance to newBalance (may overwrite concurrent top-ups)
export async function updateTokenBalance(
  walletAddress: string,
  newBalance: number,
  newPoints?: number,
  totalTokensSpent?: number,
  creditsToDeduct?: number // Optional: if provided, will do atomic decrement instead of setting balance
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
    // Use Supabase client directly for atomic operations with optimistic locking
    const { supabaseClient } = await import("@/lib/db-supabase");
    
    if (supabaseClient) {
      // Use optimistic locking to prevent race conditions
      // Read current balance, then update only if balance hasn't changed unexpectedly
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0) {
        try {
          // Read current record
          const { data: currentData, error: readError } = await (supabaseClient as any)
            .from("chat_tokens")
            .select("balance, points, total_tokens_spent")
            .eq("wallet_address", normalizedAddress)
            .single();

          if (readError && readError.code !== 'PGRST116') { // PGRST116 = not found
            throw readError;
          }

          if (currentData) {
            const currentBalance = Number(currentData.balance) || 0;
            
            // CRITICAL FIX: If creditsToDeduct is provided, use atomic decrement
            // This prevents race conditions where a top-up happens concurrently
            let adjustedBalance: number;
            
            if (creditsToDeduct !== undefined && creditsToDeduct > 0) {
              // Atomic decrement: deduct from current balance (handles concurrent top-ups correctly)
              adjustedBalance = Math.max(0, currentBalance - creditsToDeduct);
              console.log("🔒 Using atomic decrement to prevent race condition:", {
                currentBalance,
                creditsToDeduct,
                adjustedBalance,
                note: "This ensures concurrent top-ups are preserved",
              });
            } else {
              // Fallback: use provided newBalance, but check for concurrent top-ups
              // If current balance is higher than expected, it means a top-up happened
              // In this case, we should preserve the top-up by not overwriting it
              if (currentBalance > newBalance) {
                // Top-up happened concurrently - preserve it by not updating balance
                // OR: calculate the difference and deduct credits from current balance
                // Since we don't know the original balance, we'll use a conservative approach:
                // Only update if the difference is small (likely not a top-up)
                const difference = currentBalance - newBalance;
                if (difference > 10000) {
                  // Large difference suggests a top-up - preserve it
                  console.warn("⚠️ Detected potential concurrent top-up, preserving higher balance:", {
                    currentBalance,
                    expectedNewBalance: newBalance,
                    difference,
                    action: "Skipping balance update to preserve top-up",
                  });
                  adjustedBalance = currentBalance; // Preserve the top-up
                } else {
                  adjustedBalance = newBalance;
                }
              } else {
                adjustedBalance = newBalance;
              }
            }
            
            // Ensure all values are the correct type (numbers, not strings)
            const updateData: any = {
              balance: Number(adjustedBalance), // Use adjusted balance to preserve top-ups
              updated_at: new Date().toISOString(),
            };
            
            // Always update points if provided (even if 0)
            if (newPoints !== undefined) {
              updateData.points = Number(newPoints);
            }
            
            // Always update total_tokens_spent if provided
            if (totalTokensSpent !== undefined) {
              updateData.total_tokens_spent = Number(totalTokensSpent);
            }
            
            console.log("💾 Atomic update with optimistic locking:", {
              walletAddress: normalizedAddress,
              currentBalance,
              expectedNewBalance: newBalance,
              adjustedBalance,
              creditsToDeduct: creditsToDeduct !== undefined ? creditsToDeduct : 'not provided',
              updateData,
            });
            
            // Update with optimistic locking: only update if balance matches what we read
            // This prevents overwriting concurrent updates
            const { data: updateResult, error: updateError } = await (supabaseClient as any)
              .from("chat_tokens")
              .update(updateData)
              .eq("wallet_address", normalizedAddress)
              .eq("balance", currentBalance) // Optimistic locking: only update if balance hasn't changed
              .select("balance, points, total_tokens_spent")
              .single();

            if (updateError) {
              // Balance changed between read and update (race condition) - retry
              if (retries > 1) {
                console.log(`🔄 Race condition detected in updateTokenBalance, retrying... (${retries - 1} retries left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before retry
                continue;
              }
              throw updateError;
            }

            console.log("✅ Atomic update successful:", {
              walletAddress: normalizedAddress,
              updatedBalance: updateResult?.balance,
              updatedPoints: updateResult?.points,
            });
            return; // Success
          } else {
            // Record doesn't exist - check if we should create it
            console.log("🔍 Checking if wallet has minted NFT before creating chat_tokens record...");
            
            try {
              const { data: mintedToken } = await (supabaseClient as any)
                .from("tokens")
                .select("wallet_address, status, token_id")
                .eq("wallet_address", normalizedAddress)
                .or("status.eq.minted,token_id.gt.0")
                .limit(1);
              
              if (!mintedToken || mintedToken.length === 0) {
                console.log("⚠️ Wallet has not minted NFT, skipping chat_tokens record creation");
                return; // Mint etmemiş, kayıt oluşturma
              }
            } catch (mintCheckError) {
              console.error("⚠️ Error checking mint status, proceeding with insert:", mintCheckError);
            }
            
            // Insert new record
            const insertData: any = {
              wallet_address: normalizedAddress,
              balance: Number(newBalance),
              points: newPoints !== undefined ? Number(newPoints) : 0,
              total_tokens_spent: totalTokensSpent !== undefined ? Number(totalTokensSpent) : 0,
            };
            
            const { data: insertResult, error: insertError } = await (supabaseClient as any)
              .from("chat_tokens")
              .insert(insertData)
              .select("balance, points")
              .single();

            if (insertError) {
              // If insert fails due to race condition (record created by another request), retry
              if (insertError.code === '23505' && retries > 1) { // 23505 = unique violation
                console.log(`🔄 Record created by another request, retrying... (${retries - 1} retries left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50));
                continue;
              }
              throw insertError;
            }

            console.log("✅ Insert successful!");
            return; // Success
          }
        } catch (error: any) {
          lastError = error;
          if (retries > 1) {
            console.log(`🔄 Error in updateTokenBalance, retrying... (${retries - 1} retries left):`, error.message);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
          }
          throw error;
        }
      }

      if (lastError) {
        throw lastError;
      }
    }

    // Fallback to Drizzle ORM (non-atomic, but better than nothing)
    console.log("📊 Using Drizzle ORM fallback (non-atomic)...");
    const existing = await db
      .select()
      .from(chat_tokens)
      .where(eq(chat_tokens.wallet_address, normalizedAddress))
      .limit(1);
    
    console.log("📊 Existing record query result:", {
      found: existing && existing.length > 0,
      count: existing?.length || 0,
      record: existing && existing.length > 0 ? existing[0] : null,
    });

    // Ensure all values are the correct type (numbers, not strings)
    const updateData: any = {
      balance: Number(newBalance), // Ensure it's a number
      updated_at: new Date().toISOString(),
    };
    
    // Always update points if provided (even if 0)
    if (newPoints !== undefined) {
      updateData.points = Number(newPoints); // Ensure it's a number
      console.log("⭐ Points will be updated to:", newPoints, "(type:", typeof updateData.points, ")");
    } else {
      console.warn("⚠️ newPoints is undefined - points will not be updated");
    }
    
    // Always update total_tokens_spent if provided
    if (totalTokensSpent !== undefined) {
      updateData.total_tokens_spent = Number(totalTokensSpent); // Ensure it's a number
      console.log("📊 Total tokens spent will be updated to:", totalTokensSpent, "(type:", typeof updateData.total_tokens_spent, ")");
    } else {
      console.warn("⚠️ totalTokensSpent is undefined - total_tokens_spent will not be updated");
    }
    
    console.log("📦 Final updateData object:", JSON.stringify(updateData, null, 2));

    console.log("💾 Updating Supabase:", {
      walletAddress: normalizedAddress,
      updateData,
      exists: existing && existing.length > 0,
    });

    if (existing && existing.length > 0) {
      console.log("🔄 Updating existing record...");
      console.log("📝 Current record:", existing[0]);
      console.log("📝 Update data:", updateData);
      
      // Update existing record
      const updateResult = await db
        .update(chat_tokens)
        .set(updateData)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .execute();
      
      console.log("✅ Update result:", updateResult);
      
      // Verify the update by fetching the record again
      const verifyResult = await db
        .select()
        .from(chat_tokens)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .limit(1);
      
      if (verifyResult && verifyResult.length > 0) {
        console.log("✅ Verification - Updated record:", verifyResult[0]);
        console.log("✅ Balance updated:", verifyResult[0].balance === newBalance);
        console.log("✅ Points updated:", verifyResult[0].points === (newPoints || 0));
      } else {
        console.error("❌ Verification failed - record not found after update!");
      }
    } else {
      // ✅ DEĞİŞİKLİK: Önce mint kontrolü yap - sadece mint edenler için kayıt oluştur
      console.log("🔍 Checking if wallet has minted NFT before creating chat_tokens record...");
      
      try {
        const { supabaseClient } = await import("@/lib/db-supabase");
        if (supabaseClient) {
          const { data: mintedToken } = await (supabaseClient as any)
            .from("tokens")
            .select("wallet_address, status, token_id")
            .eq("wallet_address", normalizedAddress)
            .or("status.eq.minted,token_id.gt.0")
            .limit(1);
          
          if (!mintedToken || mintedToken.length === 0) {
            console.log("⚠️ Wallet has not minted NFT, skipping chat_tokens record creation");
            return; // Mint etmemiş, kayıt oluşturma
          }
        }
      } catch (mintCheckError) {
        console.error("⚠️ Error checking mint status, proceeding with insert:", mintCheckError);
        // Hata durumunda devam et (backward compatibility)
      }
      
      console.log("➕ Inserting new record...");
      console.log("📝 Insert data:", {
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: newPoints || 0,
        total_tokens_spent: totalTokensSpent || 0,
      });
      
      // Insert new record
      const insertResult = await db.insert(chat_tokens).values({
        wallet_address: normalizedAddress,
        balance: newBalance,
        points: newPoints || 0,
        total_tokens_spent: totalTokensSpent || 0,
      });
      
      console.log("✅ Insert result:", insertResult);
      
      // Verify the insert by fetching the record
      const verifyResult = await db
        .select()
        .from(chat_tokens)
        .where(eq(chat_tokens.wallet_address, normalizedAddress))
        .limit(1);
      
      if (verifyResult && verifyResult.length > 0) {
        console.log("✅ Verification - Inserted record:", verifyResult[0]);
      } else {
        console.error("❌ Verification failed - record not found after insert!");
      }
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
    // Use Supabase client directly for atomic operations
    const { supabaseClient } = await import("@/lib/db-supabase");
    
    if (supabaseClient) {
      // ATOMIC UPDATE: Use Supabase RPC to call PostgreSQL function for atomic increment
      // This prevents race conditions by doing the increment in the database
      try {
        // First, try to use RPC function if it exists (for atomic increment)
        // If RPC doesn't exist, fall back to read-then-update with retry logic
        const { data: rpcResult, error: rpcError } = await (supabaseClient as any).rpc(
          'increment_chat_tokens_balance',
          {
            p_wallet_address: normalizedAddress,
            p_amount: amount
          }
        ).catch(() => ({ data: null, error: { message: 'RPC function not available' } }));

        if (!rpcError && rpcResult !== null) {
          // RPC function exists and succeeded - return the new balance
          console.log("✅ Atomic increment via RPC successful:", {
            walletAddress: normalizedAddress,
            amount,
            newBalance: rpcResult,
          });
          return Number(rpcResult) || 0;
        }
      } catch (rpcErr) {
        // RPC function doesn't exist, fall through to alternative method
        console.log("ℹ️ RPC function not available, using alternative atomic method");
      }

      // ALTERNATIVE: Use Supabase client with optimistic locking (retry on conflict)
      // Read current balance, then update with WHERE clause to ensure atomicity
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0) {
        try {
          // Read current balance
          const { data: currentData, error: readError } = await (supabaseClient as any)
            .from("chat_tokens")
            .select("balance, points")
            .eq("wallet_address", normalizedAddress)
            .single();

          if (readError && readError.code !== 'PGRST116') { // PGRST116 = not found
            throw readError;
          }

          const currentBalance = currentData ? Number(currentData.balance) || 0 : 0;
          const currentPoints = currentData ? Number(currentData.points) || 0 : 0;
          const newBalance = currentBalance + amount;

          if (currentData) {
            // Update existing record - use the current balance as a check to prevent race conditions
            const { data: updateData, error: updateError } = await (supabaseClient as any)
              .from("chat_tokens")
              .update({
                balance: newBalance,
                points: currentPoints, // Preserve existing points
                updated_at: new Date().toISOString(),
              })
              .eq("wallet_address", normalizedAddress)
              .eq("balance", currentBalance) // Optimistic locking: only update if balance hasn't changed
              .select("balance")
              .single();

            if (updateError) {
              // Balance changed between read and update (race condition) - retry
              if (retries > 1) {
                console.log(`🔄 Race condition detected, retrying... (${retries - 1} retries left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before retry
                continue;
              }
              throw updateError;
            }

            console.log("✅ Atomic update successful:", {
              walletAddress: normalizedAddress,
              amount,
              oldBalance: currentBalance,
              newBalance: updateData?.balance || newBalance,
            });
            return Number(updateData?.balance || newBalance);
          } else {
            // Record doesn't exist - check if we should create it
            console.log("🔍 Checking if wallet has minted NFT before creating chat_tokens record...");
            
            try {
              const { data: mintedToken } = await (supabaseClient as any)
                .from("tokens")
                .select("wallet_address, status, token_id")
                .eq("wallet_address", normalizedAddress)
                .or("status.eq.minted,token_id.gt.0")
                .limit(1);
              
              if (!mintedToken || mintedToken.length === 0) {
                console.log("⚠️ Wallet has not minted NFT, skipping chat_tokens record creation");
                return amount; // Return the amount as new balance
              }
            } catch (mintCheckError) {
              console.error("⚠️ Error checking mint status, proceeding with insert:", mintCheckError);
            }
            
            // Insert new record
            const { data: insertData, error: insertError } = await (supabaseClient as any)
              .from("chat_tokens")
              .insert({
                wallet_address: normalizedAddress,
                balance: amount,
                points: 0,
                total_tokens_spent: 0,
              })
              .select("balance")
              .single();

            if (insertError) {
              // If insert fails due to race condition (record created by another request), retry
              if (insertError.code === '23505' && retries > 1) { // 23505 = unique violation
                console.log(`🔄 Record created by another request, retrying... (${retries - 1} retries left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50));
                continue;
              }
              throw insertError;
            }

            console.log("✅ Insert successful!");
            return Number(insertData?.balance || amount);
          }
        } catch (error: any) {
          lastError = error;
          if (retries > 1) {
            console.log(`🔄 Error occurred, retrying... (${retries - 1} retries left):`, error.message);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
          }
          throw error;
        }
      }

      if (lastError) {
        throw lastError;
      }
    }

    // Fallback to Drizzle ORM (non-atomic, but better than nothing)
    console.log("📊 Using Drizzle ORM fallback (non-atomic)...");
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
      // ✅ DEĞİŞİKLİK: Önce mint kontrolü yap - sadece mint edenler için kayıt oluştur
      console.log("🔍 Checking if wallet has minted NFT before creating chat_tokens record...");
      
      try {
        const { supabaseClient } = await import("@/lib/db-supabase");
        if (supabaseClient) {
          const { data: mintedToken } = await (supabaseClient as any)
            .from("tokens")
            .select("wallet_address, status, token_id")
            .eq("wallet_address", normalizedAddress)
            .or("status.eq.minted,token_id.gt.0")
            .limit(1);
          
          if (!mintedToken || mintedToken.length === 0) {
            console.log("⚠️ Wallet has not minted NFT, skipping chat_tokens record creation");
            return newBalance; // Mint etmemiş, kayıt oluşturma ama balance'ı döndür
          }
        }
      } catch (mintCheckError) {
        console.error("⚠️ Error checking mint status, proceeding with insert:", mintCheckError);
        // Hata durumunda devam et (backward compatibility)
      }
      
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

