/**
 * Weekly Report Limit Tracker
 * 
 * Lite Plan Kapasitesi:
 * - 1.5M CU/ay
 * - Her analiz (10,000 swap): ~2,000 CU (200 request × 10 CU)
 * - Teorik maksimum: 750 rapor/ay
 * - Güvenli limit (%80 marjı): 600 rapor/ay
 * - Haftalık güvenli: 150 rapor/hafta
 * - Günlük güvenli: 21 rapor/gün
 * 
 * Haftalık Limit: 140 rapor/hafta (güvenlik marjı ile)
 * Bu, aylık 560 rapor demektir (600'ün altında - GÜVEN Lİ!)
 */

import { redis } from './cache';

const WEEKLY_LIMIT = 140; // Güvenli limit (overage'a düşmemek için)

/**
 * Haftalık rapor sayısını kontrol et ve artır
 * @returns allowed: limitte mi, current: mevcut sayı, limit: maksimum, resetsIn: reset zamanı
 */
export async function checkAndIncrementWeeklyLimit(): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  resetsIn: number; // seconds
  resetsAt: string; // ISO string
}> {
  try {
    const now = new Date();
    
    // Calculate next reset time to check if we're in a new week
    const weekEnd = getWeekEnd(now);
    const resetsIn = Math.floor((weekEnd.getTime() - now.getTime()) / 1000);
    
    // If reset time has passed (resetsIn > 6 days), we're in a new week
    // In this case, we need to use the current week's key (which should be new)
    // But first, check if we need to clean up old week's key
    const currentWeekKey = getISOWeekKey(now);
    const key = `weekly-reports:${currentWeekKey}`;
    
    // Check if this is a new week (old key expired or reset time passed)
    const existingTtl = await redis.ttl(key);
    
    // If key doesn't exist or TTL is invalid, or reset time has passed, start fresh
    if (existingTtl <= 0 || resetsIn > 6 * 24 * 3600) {
      // New week - ensure we start from 0
      // Delete old key if it exists (shouldn't happen but safety check)
      if (existingTtl > 0) {
        await redis.del(key);
      }
      // Set new key with proper TTL
      const newTtl = Math.max(0, Math.floor((weekEnd.getTime() - now.getTime()) / 1000));
      await redis.setex(key, newTtl, '0'); // Start at 0
      console.log(`[WeeklyLimit] New week detected, starting fresh. TTL: ${newTtl}s`);
    }
    
    // Mevcut sayıyı artır
    const current = await redis.incr(key);
    
    // İlk kez set ediliyorsa (current === 1) TTL ayarla (haftanın sonuna kadar)
    if (current === 1) {
      const ttl = Math.floor((weekEnd.getTime() - now.getTime()) / 1000);
      await redis.expire(key, ttl);
    }
    
    const allowed = current <= WEEKLY_LIMIT;
    
    // Reset zamanı
    const ttl = await redis.ttl(key);
    const resetsAt = weekEnd.toISOString();
    
    console.log(`[WeeklyLimit] ${current}/${WEEKLY_LIMIT} reports used this week (key: ${currentWeekKey}, TTL: ${ttl}s)`);
    if (!allowed) {
      console.warn(`[WeeklyLimit] ⚠️ WEEKLY LIMIT REACHED! Current: ${current}, Limit: ${WEEKLY_LIMIT}`);
    }
    
    return {
      allowed,
      current,
      limit: WEEKLY_LIMIT,
      resetsIn: ttl > 0 ? ttl : resetsIn,
      resetsAt,
    };
  } catch (error: any) {
    console.error('[WeeklyLimit] ❌ Error:', error.message);
    // Hata durumunda izin ver (fail-open)
    return {
      allowed: true,
      current: 0,
      limit: WEEKLY_LIMIT,
      resetsIn: 0,
      resetsAt: new Date().toISOString(),
    };
  }
}

/**
 * Haftalık limiti kontrol et (artırmadan)
 */
export async function getWeeklyLimitStatus(): Promise<{
  current: number;
  limit: number;
  remaining: number;
  resetsIn: number;
  resetsAt: string;
}> {
  try {
    const now = new Date();
    
    // Calculate next reset time (Sunday UTC 22:00)
    const weekEnd = getWeekEnd(now);
    const resetsIn = Math.max(0, Math.floor((weekEnd.getTime() - now.getTime()) / 1000));
    
    // Check if reset time has passed (resetsIn should be > 0, if 0 or negative, we're past reset)
    // Also check if we're in a new week by comparing week keys
    const currentWeekKey = getISOWeekKey(now);
    const key = `weekly-reports:${currentWeekKey}`;
    
    // Check if key exists and has valid TTL
    const ttl = await redis.ttl(key);
    
    // If TTL is -2 (key doesn't exist) or -1 (no expiration set), it's a new week
    // If TTL is 0 or negative, reset to 0
    // Also, if reset time has passed (resetsIn is very large, meaning next week), check if we should use current week
    let current = 0;
    
    // If reset time has passed (we're past Sunday 22:00), we should be in a new week
    // Check if the current week's key exists and is valid
    if (ttl > 0) {
      // Key exists and has valid TTL - use it
      const currentStr = await redis.get(key);
      current = currentStr ? parseInt(currentStr, 10) : 0;
    } else if (ttl === -2) {
      // Key doesn't exist - new week, reset to 0
      current = 0;
    } else if (ttl === -1) {
      // Key exists but no expiration - this shouldn't happen, but treat as expired
      current = 0;
    } else {
      // TTL is 0 or negative - key expired, reset to 0
      current = 0;
    }
    
    // Additional check: If reset time has passed (resetsIn > 6 days), we're in a new week
    // In this case, the current week's key should be used (which should be 0 or new)
    if (resetsIn > 6 * 24 * 3600) {
      // More than 6 days until reset means we're looking at next week's reset
      // This means current week's reset has passed, so we should be using new week's key
      // If old key still exists, it means we're reading wrong week - force to 0
      if (ttl > 0 && ttl < 7 * 24 * 3600) {
        // Old week's key still exists with valid TTL - this shouldn't happen but handle it
        console.log(`[WeeklyLimit] Reset time has passed but old key exists (TTL: ${ttl}s), using 0 for new week`);
        current = 0;
      } else {
        // New week's key should be used - if it doesn't exist, it's 0
        if (ttl === -2) {
          current = 0;
        }
      }
    }
    
    const remaining = Math.max(0, WEEKLY_LIMIT - current);
    const resetsAt = weekEnd.toISOString();
    
    console.log(`[WeeklyLimit] Status: ${current}/${WEEKLY_LIMIT} (remaining: ${remaining}), resets in ${resetsIn}s, TTL: ${ttl}`);
    
    return {
      current,
      limit: WEEKLY_LIMIT,
      remaining,
      resetsIn,
      resetsAt,
    };
  } catch (error: any) {
    console.error('[WeeklyLimit] ❌ Error getting status:', error.message);
    // On error, assume limit is available (fail-open)
    const weekEnd = getWeekEnd(new Date());
    return {
      current: 0,
      limit: WEEKLY_LIMIT,
      remaining: WEEKLY_LIMIT,
      resetsIn: Math.max(0, Math.floor((weekEnd.getTime() - Date.now()) / 1000)),
      resetsAt: weekEnd.toISOString(),
    };
  }
}

/**
 * Week formatında key oluştur (YYYY-Www)
 * Örnek: 2025-W50
 * Pazar haftanın son günü, Pazartesi haftanın ilk günü
 */
function getISOWeekKey(date: Date): string {
  const year = date.getFullYear();
  const weekNumber = getWeekNumber(date);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Week number hesapla (Pazar haftanın son günü)
 * Pazar gecesi reset yapıldığı için, hafta numarası Pazartesi'den başlar
 */
function getWeekNumber(date: Date): number {
  const tempDate = new Date(date.getTime());
  
  // Pazar'ı haftanın son günü olarak kabul et, Pazartesi'yi haftanın ilk günü yap
  // Pazar = 0, Pazartesi = 1, ..., Cumartesi = 6
  const dayOfWeek = tempDate.getDay(); // 0 = Pazar, 1 = Pazartesi, ..., 6 = Cumartesi
  
  // Eğer Pazar ise, bir önceki Pazartesi'ye git (aynı hafta)
  // Pazar gecesi reset yapıldığı için, Pazar günü hala eski hafta sayılır
  if (dayOfWeek === 0) {
    // Pazar günü - bir önceki Pazartesi'ye git (aynı hafta)
    tempDate.setDate(tempDate.getDate() - 6);
  } else {
    // Diğer günler - bu haftanın Pazartesi'sine git
    tempDate.setDate(tempDate.getDate() - (dayOfWeek - 1));
  }
  
  // Yılın ilk Pazartesi'sini bul
  const jan1 = new Date(tempDate.getFullYear(), 0, 1);
  const jan1DayOfWeek = jan1.getDay(); // 0 = Pazar, 1 = Pazartesi, ..., 6 = Cumartesi
  
  // İlk Pazartesi'yi bul
  let firstMonday: Date;
  if (jan1DayOfWeek === 0) {
    // 1 Ocak Pazar ise, 2 Ocak Pazartesi
    firstMonday = new Date(tempDate.getFullYear(), 0, 2);
  } else if (jan1DayOfWeek === 1) {
    // 1 Ocak Pazartesi ise, o gün
    firstMonday = new Date(tempDate.getFullYear(), 0, 1);
  } else {
    // Diğer günler ise, ilk Pazartesi'ye git
    firstMonday = new Date(tempDate.getFullYear(), 0, 1 + (8 - jan1DayOfWeek));
  }
  
  // Hafta numarasını hesapla
  const daysDiff = Math.floor((tempDate.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  
  return weekNumber;
}

/**
 * Haftanın son gününü al (Pazar UTC 22:15)
 * Eğer reset zamanı geçmişse, bir sonraki haftanın reset zamanına git
 */
function getWeekEnd(date: Date): Date {
  const now = new Date(date);
  const weekEnd = new Date(date);
  
  // Pazar'a git
  const dayOfWeek = weekEnd.getDay(); // 0 = Pazar
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
  
  // UTC 22:15'a ayarla (Pazar gecesi) - Test için
  weekEnd.setUTCHours(22, 15, 0, 0);
  
  // Eğer reset zamanı geçmişse, bir sonraki haftanın reset zamanına git
  if (weekEnd.getTime() <= now.getTime()) {
    weekEnd.setDate(weekEnd.getDate() + 7);
  }
  
  return weekEnd;
}

/**
 * Haftalık limiti sıfırla (sadece test için)
 */
export async function resetWeeklyLimit(): Promise<void> {
  try {
    const weekKey = getISOWeekKey(new Date());
    const key = `weekly-reports:${weekKey}`;
    await redis.del(key);
    console.log(`[WeeklyLimit] 🔄 Reset weekly limit for ${weekKey}`);
  } catch (error: any) {
    console.error('[WeeklyLimit] ❌ Error resetting limit:', error.message);
  }
}

