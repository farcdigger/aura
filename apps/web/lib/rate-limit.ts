import { rateLimit } from "./kv";

export async function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60000
): Promise<boolean> {
  const key = `rate_limit:${identifier}`;
  try {
    return await rateLimit(key, limit, windowMs);
  } catch (error) {
    console.warn("Rate limit check failed, allowing request (fail-open):", error);
    return true; // Fail-open: If rate limiting fails, allow the request
  }
}

export async function checkGenerateRateLimit(xUserId: string): Promise<boolean> {
  // Rate limit: 20 per hour (increased for better testing experience)
  // You can adjust this limit or disable rate limiting during development
  return checkRateLimit(`generate:${xUserId}`, 20, 3600000); // 20 per hour (1 hour window)
}

export async function checkMintRateLimit(wallet: string): Promise<boolean> {
  // Rate limit: 30 per hour (increased for testing)
  // You can adjust this limit or use admin endpoint to clear rate limits
  // Admin endpoint: POST /api/admin/clear-mint-rate-limit with { wallet, action: "clear" }
  return checkRateLimit(`mint:${wallet}`, 30, 3600000); // 30 per hour (1 hour window)
}

