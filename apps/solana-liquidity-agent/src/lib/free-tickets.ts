/**
 * Free Ticket System
 * 
 * Provides free analysis tickets for users who paid but analysis failed
 * Reasons:
 * - Analysis failed after payment (invalid token, system error, etc.)
 * - Weekly limit reached after payment
 * 
 * Tickets are stored in Redis with TTL until next week reset
 */

import { redis } from './cache';

const TICKET_KEY_PREFIX = 'free-ticket:';
const TICKET_TTL_DAYS = 7; // Tickets expire after 1 week

/**
 * Issue a free ticket to a user
 * @param userWallet User wallet address (normalized lowercase)
 * @param reason Reason for free ticket (e.g., 'analysis_failed', 'weekly_limit_reached')
 * @param metadata Additional metadata (transaction hash, error message, etc.)
 */
export async function issueFreeTicket(
  userWallet: string,
  reason: string,
  metadata?: {
    transactionHash?: string;
    errorMessage?: string;
    tokenMint?: string;
    timestamp?: string;
  }
): Promise<void> {
  try {
    const normalizedWallet = userWallet.toLowerCase().trim();
    const key = `${TICKET_KEY_PREFIX}${normalizedWallet}`;
    
    const ticketData = {
      wallet: normalizedWallet,
      reason,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TICKET_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      metadata: metadata || {},
    };
    
    // Store ticket in Redis (JSON string)
    const ttlSeconds = TICKET_TTL_DAYS * 24 * 60 * 60;
    await redis.setex(key, ttlSeconds, JSON.stringify(ticketData));
    
    console.log(`[FreeTicket] ✅ Free ticket issued to ${normalizedWallet.substring(0, 10)}... (reason: ${reason})`);
  } catch (error: any) {
    console.error('[FreeTicket] ❌ Error issuing free ticket:', error.message);
    // Don't throw - ticket system is not critical
  }
}

/**
 * Check if user has a free ticket
 * @param userWallet User wallet address (normalized lowercase)
 * @returns Ticket data if exists and not used, null otherwise
 */
export async function checkFreeTicket(userWallet: string): Promise<{
  wallet: string;
  reason: string;
  issuedAt: string;
  expiresAt: string;
  used: boolean;
  metadata: any;
} | null> {
  try {
    const normalizedWallet = userWallet.toLowerCase().trim();
    const key = `${TICKET_KEY_PREFIX}${normalizedWallet}`;
    
    const ticketDataStr = await redis.get(key);
    if (!ticketDataStr) {
      return null;
    }
    
    const ticketData = JSON.parse(ticketDataStr);
    
    // Check if ticket is expired
    if (new Date(ticketData.expiresAt) < new Date()) {
      await redis.del(key);
      return null;
    }
    
    // Check if ticket is already used
    if (ticketData.used) {
      return null;
    }
    
    return ticketData;
  } catch (error: any) {
    console.error('[FreeTicket] ❌ Error checking free ticket:', error.message);
    return null;
  }
}

/**
 * Use a free ticket (mark as used)
 * @param userWallet User wallet address (normalized lowercase)
 * @returns True if ticket was used successfully, false otherwise
 */
export async function useFreeTicket(userWallet: string): Promise<boolean> {
  try {
    const normalizedWallet = userWallet.toLowerCase().trim();
    const key = `${TICKET_KEY_PREFIX}${normalizedWallet}`;
    
    const ticketDataStr = await redis.get(key);
    if (!ticketDataStr) {
      return false;
    }
    
    const ticketData = JSON.parse(ticketDataStr);
    
    // Check if ticket is expired
    if (new Date(ticketData.expiresAt) < new Date()) {
      await redis.del(key);
      return false;
    }
    
    // Check if ticket is already used
    if (ticketData.used) {
      return false;
    }
    
    // Mark as used
    ticketData.used = true;
    ticketData.usedAt = new Date().toISOString();
    
    // Update in Redis
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.setex(key, ttl, JSON.stringify(ticketData));
      console.log(`[FreeTicket] ✅ Free ticket used by ${normalizedWallet.substring(0, 10)}...`);
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error('[FreeTicket] ❌ Error using free ticket:', error.message);
    return false;
  }
}

/**
 * Get all free tickets for a user (for admin/debugging)
 * @param userWallet User wallet address (normalized lowercase)
 * @returns Array of ticket data
 */
export async function getUserFreeTickets(userWallet: string): Promise<any[]> {
  try {
    const normalizedWallet = userWallet.toLowerCase().trim();
    const key = `${TICKET_KEY_PREFIX}${normalizedWallet}`;
    
    const ticketDataStr = await redis.get(key);
    if (!ticketDataStr) {
      return [];
    }
    
    const ticketData = JSON.parse(ticketDataStr);
    return [ticketData];
  } catch (error: any) {
    console.error('[FreeTicket] ❌ Error getting user free tickets:', error.message);
    return [];
  }
}

