import { env, isMockMode } from "../env.mjs";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Mock KV storage
const mockKv: Map<string, string> = new Map();

// Mock KV functions
const mockKvClient = {
  get: async (key: string) => {
    return mockKv.get(key) || null;
  },
  set: async (key: string, value: string) => {
    mockKv.set(key, value);
    return "OK";
  },
  setex: async (key: string, seconds: number, value: string) => {
    mockKv.set(key, value);
    setTimeout(() => mockKv.delete(key), seconds * 1000);
    return "OK";
  },
  incr: async (key: string) => {
    const current = parseInt(mockKv.get(key) || "0");
    const next = current + 1;
    mockKv.set(key, next.toString());
    return next;
  },
  exists: async (key: string) => {
    return mockKv.has(key) ? 1 : 0;
  },
  del: async (key: string) => {
    mockKv.delete(key);
    return 1;
  },
  expire: async (key: string, seconds: number) => {
    if (mockKv.has(key)) {
      setTimeout(() => mockKv.delete(key), seconds * 1000);
      return 1;
    }
    return 0;
  },
};

// Supabase (PostgreSQL) KV client implementation
const supabaseKvClient = {
  get: async (key: string) => {
    try {
      // Clean up expired keys first
      await db.execute(sql`
        DELETE FROM kv_store 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `);

      // Get the value
      const result = await db.execute(sql`
        SELECT value FROM kv_store 
        WHERE key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
      `);

      if (result.rows && result.rows.length > 0) {
        return result.rows[0].value as string;
      }
      return null;
    } catch (error: any) {
      // Check if it's a connection error
      if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
        console.error("❌ Supabase KV connection error - DATABASE_URL may be wrong or Supabase is down:", {
          code: error.code,
          hostname: error.hostname || "unknown",
          message: error.message,
          note: "Check Vercel environment variables - DATABASE_URL should be set"
        });
      } else {
        console.error("Supabase KV get error:", error);
      }
      return null;
    }
  },

  set: async (key: string, value: string) => {
    try {
      await db.execute(sql`
        INSERT INTO kv_store (key, value, expires_at)
        VALUES (${key}, ${value}, NULL)
        ON CONFLICT (key) 
        DO UPDATE SET value = ${value}, expires_at = NULL
      `);
      return "OK";
    } catch (error) {
      console.error("Supabase KV set error:", error);
      throw error;
    }
  },

  setex: async (key: string, seconds: number, value: string) => {
    try {
      const expiresAt = new Date(Date.now() + seconds * 1000);
      await db.execute(sql`
        INSERT INTO kv_store (key, value, expires_at)
        VALUES (${key}, ${value}, ${expiresAt.toISOString()})
        ON CONFLICT (key) 
        DO UPDATE SET value = ${value}, expires_at = ${expiresAt.toISOString()}
      `);
      return "OK";
    } catch (error) {
      console.error("Supabase KV setex error:", error);
      throw error;
    }
  },

  incr: async (key: string) => {
    try {
      // Supabase KV incr - for rate limiting
      // If this fails, rate limiting will fall back to fail-open (allow request)
      // Clean up expired keys first
      await db.execute(sql`
        DELETE FROM kv_store 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `);
      
      // First try to update existing value
      const updateResult = await db.execute(sql`
        UPDATE kv_store 
        SET value = (CAST(value AS INTEGER) + 1)::TEXT, created_at = NOW()
        WHERE key = ${key}
        RETURNING value
      `);
      
      const updatedRows = updateResult.rows as any[];
      if (updatedRows && updatedRows.length > 0) {
        return parseInt(updatedRows[0]?.value || "0");
      }
      
      // If no existing value, insert new
      const insertResult = await db.execute(sql`
        INSERT INTO kv_store (key, value, expires_at)
        VALUES (${key}, '1', NULL)
        RETURNING value
      `);
      
      const insertedRows = insertResult.rows as any[];
      return parseInt(insertedRows[0]?.value || "0");
    } catch (error: any) {
      console.error("Supabase KV incr error:", {
        error: error?.message || "Unknown error",
        code: error?.code,
        note: "Rate limiting will fall back to allowing requests"
      });
      throw error; // Let rate-limit.ts handle fail-open
    }
  },

  exists: async (key: string) => {
    try {
      // Clean up expired keys first
      await db.execute(sql`
        DELETE FROM kv_store 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `);

      const result = await db.execute(sql`
        SELECT 1 FROM kv_store 
        WHERE key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
      `);

      return result.rows && result.rows.length > 0 ? 1 : 0;
    } catch (error) {
      console.error("Supabase KV exists error:", error);
      return 0;
    }
  },

  del: async (key: string) => {
    try {
      // Check if key exists before deletion
      const existsResult = await db.execute(sql`
        SELECT 1 FROM kv_store WHERE key = ${key}
      `);
      const existed = existsResult.rows && existsResult.rows.length > 0;
      
      if (existed) {
        await db.execute(sql`
          DELETE FROM kv_store WHERE key = ${key}
        `);
        return 1;
      }
      return 0;
    } catch (error) {
      console.error("Supabase KV del error:", error);
      return 0;
    }
  },

  expire: async (key: string, seconds: number) => {
    try {
      const expiresAt = new Date(Date.now() + seconds * 1000);
      await db.execute(sql`
        UPDATE kv_store 
        SET expires_at = ${expiresAt.toISOString()}
        WHERE key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
      `);
      // Check if key exists and was updated
      const check = await db.execute(sql`
        SELECT expires_at FROM kv_store 
        WHERE key = ${key} AND expires_at = ${expiresAt.toISOString()}
      `);
      return check.rows && check.rows.length > 0 ? 1 : 0;
    } catch (error) {
      console.error("Supabase KV expire error:", error);
      return 0;
    }
  },
};

// Determine which KV client to use
// Priority: Supabase (PostgreSQL) > Mock
// Use Supabase if database is available and not in mock mode
let kvClient: typeof mockKvClient | typeof supabaseKvClient = mockKvClient;

// Check if we can use Supabase KV
if (!isMockMode && env.DATABASE_URL && !env.DATABASE_URL.includes("mock://")) {
  // Validate DATABASE_URL format
  try {
    const dbUrl = new URL(env.DATABASE_URL);
    if (dbUrl.protocol === "postgresql:" || dbUrl.protocol === "postgres:") {
      // Test if we can access db (lazy connection - will fail on first use if wrong)
      kvClient = supabaseKvClient;
      console.log("✅ Supabase KV (PostgreSQL) will be used");
    } else {
      console.warn("⚠️ Invalid DATABASE_URL protocol, using mock KV:", dbUrl.protocol);
      kvClient = mockKvClient;
    }
  } catch (urlError) {
    console.error("❌ Invalid DATABASE_URL format, using mock KV:", urlError);
    kvClient = mockKvClient;
  }
} else {
  if (isMockMode || !env.DATABASE_URL || env.DATABASE_URL.includes("mock://")) {
    console.log("ℹ️ Using mock KV storage (development mode or DATABASE_URL not configured)");
  } else {
    console.warn("⚠️ DATABASE_URL not set in production - using mock KV (cookie fallback will be used for PKCE)");
    kvClient = mockKvClient;
  }
}

export const kv = kvClient as any;

// Export KV status for debugging
export const isKvAvailable = kvClient === supabaseKvClient;

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, Math.floor(windowMs / 1000));
  }
  return count <= limit;
}

export async function acquireLock(key: string, ttlSeconds: number = 60): Promise<boolean> {
  const lockKey = `lock:${key}`;
  const exists = await kv.exists(lockKey);
  if (exists) {
    return false;
  }
  await kv.setex(lockKey, ttlSeconds, "1");
  return true;
}

export async function releaseLock(key: string): Promise<void> {
  await kv.del(`lock:${key}`);
}
