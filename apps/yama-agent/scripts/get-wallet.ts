import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// .env dosyasını yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const privateKey = process.env.SERVER_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!privateKey) {
  console.error("❌ SERVER_SIGNER_PRIVATE_KEY veya PRIVATE_KEY environment variable bulunamadı!");
  console.error("💡 apps/web/.env.local dosyasından SERVER_SIGNER_PRIVATE_KEY'i kopyalayın");
  process.exit(1);
}

if (!privateKey.startsWith("0x")) {
  console.error("❌ Private key 0x ile başlamalı!");
  process.exit(1);
}

try {
  const wallet = new ethers.Wallet(privateKey);
  console.log("✅ Wallet Address:", wallet.address);
  console.log("\n📋 Bu adresi kullanın:");
  console.log(`   PAYMENTS_RECEIVABLE_ADDRESS=${wallet.address}`);
  console.log("\n💡 .env dosyasına ekleyin veya config.json'da kullanın");
} catch (error: any) {
  console.error("❌ Hata:", error.message);
  process.exit(1);
}

















