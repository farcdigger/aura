import readline from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function setupSupabase() {
  console.log("🚀 Supabase Setup Wizard\n");

  // Check if .env.local exists
  const envPath = join(process.cwd(), ".env.local");
  let envContent = "";
  
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
    console.log("✅ Found existing .env.local file\n");
  } else {
    console.log("ℹ️  Creating new .env.local file\n");
  }

  // Check if DATABASE_URL already exists
  if (envContent.includes("DATABASE_URL=")) {
    console.log("⚠️  DATABASE_URL already exists in .env.local");
    const overwrite = await question("Do you want to update it? (y/n): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("❌ Setup cancelled");
      rl.close();
      return;
    }
    // Remove existing DATABASE_URL
    envContent = envContent.replace(/DATABASE_URL=.*\n/g, "");
  }

  console.log("\n📋 Please provide Supabase connection details:\n");

  // Get Project URL
  const projectUrl = await question("1. Supabase Project URL (e.g., https://xxxxx.supabase.co): ");
  if (!projectUrl || !projectUrl.includes("supabase.co")) {
    console.error("❌ Invalid Project URL");
    rl.close();
    return;
  }

  // Extract PROJECT-REF from URL
  const projectRefMatch = projectUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!projectRefMatch) {
    console.error("❌ Could not extract project reference from URL");
    rl.close();
    return;
  }
  const projectRef = projectRefMatch[1];
  console.log(`   ✓ Project Reference: ${projectRef}\n`);

  // Get Database Password
  const dbPassword = await question("2. Database Password (from Supabase Settings → Database): ");
  if (!dbPassword) {
    console.error("❌ Database password is required");
    rl.close();
    return;
  }

  // Ask for connection type
  console.log("\n3. Connection Type:");
  console.log("   [1] Direct connection (port 5432) - Recommended");
  console.log("   [2] Connection pooling (port 6543) - For production");
  const connType = await question("   Choose (1 or 2, default: 1): ");

  let connectionString = "";
  if (connType === "2") {
    // Pooling connection - need region
    console.log("\n   For pooling, you need the region (e.g., eu-west-1, us-east-1)");
    const region = await question("   Region (default: eu-west-1): ") || "eu-west-1";
    connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
  } else {
    // Direct connection
    connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  console.log("\n✅ Connection string generated!");
  console.log(`   ${connectionString.replace(dbPassword, "****")}\n`);

  // Add DATABASE_URL to .env.local
  const newEnvLine = `DATABASE_URL=${connectionString}\n`;
  const updatedEnv = envContent + (envContent && !envContent.endsWith("\n") ? "\n" : "") + newEnvLine;

  writeFileSync(envPath, updatedEnv);
  console.log("✅ DATABASE_URL added to .env.local\n");

  // Ask if user wants to run migration
  const runMigration = await question("Run migration now to create tables? (y/n): ");
  if (runMigration.toLowerCase() === "y") {
    console.log("\n🔄 Running migrations...\n");
    const { execSync } = require("child_process");
    try {
      execSync("npm run migrate", { stdio: "inherit", cwd: process.cwd() });
      console.log("\n✅ Migration completed successfully!");
    } catch (error) {
      console.error("\n❌ Migration failed. Please run manually: npm run migrate");
    }
  } else {
    console.log("\nℹ️  You can run migration manually later:");
    console.log("   npm run migrate\n");
  }

  rl.close();
}

setupSupabase().catch((error) => {
  console.error("❌ Setup failed:", error);
  rl.close();
  process.exit(1);
});

