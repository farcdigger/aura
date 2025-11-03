import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function runMigrations() {
  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      x_user_id VARCHAR(255) NOT NULL UNIQUE,
      username VARCHAR(255) NOT NULL,
      profile_image_url TEXT,
      wallet_address VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create tokens table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tokens (
      id SERIAL PRIMARY KEY,
      x_user_id VARCHAR(255) NOT NULL,
      token_id INTEGER NOT NULL UNIQUE,
      seed VARCHAR(64) NOT NULL,
      token_uri TEXT NOT NULL,
      metadata_uri TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      traits JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create payments table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      x_user_id VARCHAR(255) NOT NULL,
      wallet_address VARCHAR(255) NOT NULL,
      amount VARCHAR(100) NOT NULL,
      transaction_hash VARCHAR(255),
      status VARCHAR(50) NOT NULL,
      x402_payment_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create kv_store table for key-value storage (Supabase alternative to Redis KV)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create index for expired key cleanup
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_kv_store_expires_at ON kv_store(expires_at);
  `);

  // Create indexes
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_users_x_user_id ON users(x_user_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_tokens_x_user_id ON tokens(x_user_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_payments_x_user_id ON payments(x_user_id);
  `);
}

