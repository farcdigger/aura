import postgres from "postgres";
import { env } from "../env.mjs";

const connectionString = env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL not configured");
  process.exit(1);
}
const sql = postgres(connectionString);

async function runMigrations() {
  console.log("Running database migrations...");
  if (connectionString) {
    console.log("Database:", connectionString.replace(/:[^:@]+@/, ":****@"));
  }

  try {
    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        x_user_id VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(255) NOT NULL,
        profile_image_url TEXT,
        wallet_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;
    console.log("✓ users table created");

    // Tokens table
    await sql`
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
    `;
    console.log("✓ tokens table created");

    // Payments table
    await sql`
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
    `;
    console.log("✓ payments table created");

    // KV Store table (Supabase alternative to Redis KV)
    await sql`
      CREATE TABLE IF NOT EXISTS kv_store (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    console.log("✓ kv_store table created");

    // Indexes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_x_user_id ON users(x_user_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tokens_x_user_id ON tokens(x_user_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_payments_x_user_id ON payments(x_user_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_kv_store_expires_at ON kv_store(expires_at);
    `;
    console.log("✓ indexes created");

    console.log("\n✅ All migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();

