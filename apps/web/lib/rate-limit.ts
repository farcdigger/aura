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
  return checkRateLimit(`generate:${xUserId}`, 5, 3600000); // 5 per hour
}

export async function checkMintRateLimit(wallet: string): Promise<boolean> {
  return checkRateLimit(`mint:${wallet}`, 3, 3600000); // 3 per hour
}

