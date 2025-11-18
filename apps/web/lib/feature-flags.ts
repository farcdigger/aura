import { env } from "@/env.mjs";

/**
 * Mesajlaşma özelliğinin aktif olup olmadığını kontrol eder
 * @param walletAddress - Kullanıcının cüzdan adresi
 * @returns boolean - Özellik aktif mi?
 */
export function isMessagingEnabled(walletAddress?: string | null): boolean {
  // Geliştirme modunda her zaman aktif
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  
  // GEÇICI: Hard-coded developer wallet (environment variables çalışmıyor)
  const DEVELOPER_WALLET = "0xEdf8e693b3ab4899a03aB22eDF90E36a6AC1Fd9d";
  
  // Geliştirici cüzdan kontrolü
  if (walletAddress?.toLowerCase() === DEVELOPER_WALLET.toLowerCase()) {
    return true;
  }
  
  // Feature flag kontrolü (fallback)
  if (env.NEXT_PUBLIC_ENABLE_MESSAGING_FEATURE === "true") {
    if (env.NEXT_PUBLIC_DEVELOPER_WALLET_ADDRESS) {
      return walletAddress?.toLowerCase() === env.NEXT_PUBLIC_DEVELOPER_WALLET_ADDRESS.toLowerCase();
    }
    return true;
  }
  
  return false;
}

/**
 * Spam koruması için rate limit kontrolü
 */
export const MESSAGING_RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 10,
  MESSAGES_PER_HOUR: 100,
  MAX_MESSAGE_LENGTH: 500,
} as const;

/**
 * Mesajlaşma özelliği için gerekli izinleri kontrol eder
 */
export function checkMessagingPermissions(walletAddress?: string | null): {
  hasAccess: boolean;
  reason?: string;
} {
  if (!walletAddress) {
    return { hasAccess: false, reason: "Wallet not connected" };
  }
  
  if (!isMessagingEnabled(walletAddress)) {
    return { hasAccess: false, reason: "Messaging feature not enabled for this wallet" };
  }
  
  return { hasAccess: true };
}
