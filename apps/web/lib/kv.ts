import { env, isMockMode } from "../env.mjs";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { kv as vercelKv } from "@vercel/kv";

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
      // Check if it's a connection error (DNS, network, etc.)
      if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT") {
        console.error("❌ Supabase KV connection error (ENOTFOUND/ECONNREFUSED):", {
          code: error?.code,
          hostname: error?.hostname || "unknown",
          message: error?.message,
          note: "DATABASE_URL connection string may be incorrect. Check Vercel environment variables.",
          suggestion: "Use connection pooling URL: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
        });
      } else {
        console.error("Supabase KV incr error:", {
          error: error?.message || "Unknown error",
          code: error?.code,
          note: "Rate limiting will fall back to allowing requests"
        });
      }
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

// Vercel KV (Redis) client implementation
// Vercel KV is preferred for rate limiting as it's faster and more reliable
const vercelKvClient = {
  get: async (key: string) => {
    try {
      const result = await vercelKv.get<string>(key);
      if (result === null) {
        console.log(`ℹ️ Vercel KV get: key "${key}" not found (this is OK if key doesn't exist)`);
      } else {
        console.log(`✅ Vercel KV get: key "${key}" found, length: ${result.length}`);
      }
      return result;
    } catch (error: any) {
      console.error("❌ Vercel KV get error:", {
        key: key.substring(0, 50) + "...",
        error: error?.message || "Unknown error",
        code: error?.code,
        note: "This may indicate KV connection issue - check KV_REST_API_URL and KV_REST_API_TOKEN"
      });
      return null;
    }
  },
  set: async (key: string, value: string) => {
    try {
      await vercelKv.set(key, value);
      return "OK";
    } catch (error) {
      console.error("Vercel KV set error:", error);
      throw error;
    }
  },
  setex: async (key: string, seconds: number, value: string) => {
    try {
      await vercelKv.set(key, value, { ex: seconds });
      console.log(`✅ Vercel KV setex: key "${key}" stored for ${seconds} seconds`);
      return "OK";
    } catch (error: any) {
      console.error("❌ Vercel KV setex error:", {
        key: key.substring(0, 50) + "...",
        error: error?.message || "Unknown error",
        code: error?.code,
        note: "This may indicate KV connection issue - check KV_REST_API_URL and KV_REST_API_TOKEN"
      });
      throw error;
    }
  },
  incr: async (key: string) => {
    try {
      return await vercelKv.incr(key);
    } catch (error: any) {
      console.error("Vercel KV incr error:", {
        error: error?.message || "Unknown error",
        code: error?.code,
        note: "Rate limiting will fall back to allowing requests"
      });
      throw error;
    }
  },
  exists: async (key: string) => {
    try {
      const result = await vercelKv.exists(key);
      return result ? 1 : 0;
    } catch (error) {
      console.error("Vercel KV exists error:", error);
      return 0;
    }
  },
  del: async (key: string) => {
    try {
      await vercelKv.del(key);
      return 1;
    } catch (error) {
      console.error("Vercel KV del error:", error);
      return 0;
    }
  },
  expire: async (key: string, seconds: number) => {
    try {
      await vercelKv.expire(key, seconds);
      return 1;
    } catch (error) {
      console.error("Vercel KV expire error:", error);
      return 0;
    }
  },
};

// Determine which KV client to use
// Priority: Vercel KV (Redis) > Supabase (PostgreSQL) > Mock
// Vercel KV is preferred for rate limiting as it's faster and avoids connection issues
let kvClient: typeof mockKvClient | typeof supabaseKvClient | typeof vercelKvClient = mockKvClient;

// Check if Vercel KV is available (preferred for rate limiting)
// Vercel KV is checked synchronously - actual connection will be tested on first use
if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN && !env.KV_REST_API_URL.includes("localhost")) {
  // Use Vercel KV - connection will be tested on first use (lazy connection)
  kvClient = vercelKvClient;
  console.log("✅ Vercel KV (Redis) will be used for rate limiting");
}

// Fallback to Supabase KV if Vercel KV is not available
if (kvClient === mockKvClient && !isMockMode && env.DATABASE_URL && !env.DATABASE_URL.includes("mock://")) {
  // Validate DATABASE_URL format
  try {
    const dbUrl = new URL(env.DATABASE_URL);
    if (dbUrl.protocol === "postgresql:" || dbUrl.protocol === "postgres:") {
      kvClient = supabaseKvClient;
      console.log("✅ Supabase KV (PostgreSQL) will be used for rate limiting");
    } else {
      console.warn("⚠️ Invalid DATABASE_URL protocol, using mock KV:", dbUrl.protocol);
      kvClient = mockKvClient;
    }
  } catch (urlError) {
    console.error("❌ Invalid DATABASE_URL format, using mock KV:", urlError);
    kvClient = mockKvClient;
  }
}

// Final fallback to mock KV
if (kvClient === mockKvClient) {
  if (isMockMode || !env.DATABASE_URL || env.DATABASE_URL.includes("mock://")) {
    console.log("ℹ️ Using mock KV storage (development mode or no KV configured)");
  } else {
    console.warn("⚠️ No KV storage configured - using mock KV (rate limiting will be permissive)");
  }
}

export const kv = kvClient as any;

// Export KV status for debugging
export const isKvAvailable = kvClient !== mockKvClient;
export const isVercelKv = kvClient === vercelKvClient;
export const isSupabaseKv = kvClient === supabaseKvClient;

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
