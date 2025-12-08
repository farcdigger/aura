import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisResult, PoolAnalysisRecord } from './types';

// =============================================================================
// SUPABASE CLIENT CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get or create Supabase client singleton
 * Uses service role key for full database access
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('[Supabase] ✅ Client initialized');
    console.log(`[Supabase]    URL: ${SUPABASE_URL}`);
    console.log(`[Supabase]    Key: ${SUPABASE_SERVICE_KEY.substring(0, 20)}...`);
  }

  return supabaseInstance;
}

// Export singleton
export const supabase = getSupabaseClient();

// =============================================================================
// ANALYSIS OPERATIONS
// =============================================================================

/**
 * Helper function to serialize BigInt values in objects
 * Recursively converts all BigInt values to strings
 */
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  
  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        serialized[key] = serializeBigInt(obj[key]);
      }
    }
    return serialized;
  }
  
  return obj;
}

/**
 * Save analysis result to database
 * @param analysis Complete analysis result
 * @param userId Optional user ID for tracking
 * @returns Inserted record
 */
export async function saveAnalysis(
  analysis: AnalysisResult,
  userId?: string,
  userWallet?: string  // ✅ YENİ: Kullanıcı cüzdan adresi
): Promise<PoolAnalysisRecord | null> {
  try {
    console.log(`[Supabase] Saving analysis for pool: ${analysis.poolId}`);

    // Serialize BigInt values before saving
    const serializedReserves = serializeBigInt(analysis.reserves);
    const serializedTransactions = serializeBigInt(analysis.transactions);

    const record = {
      pool_id: analysis.poolId,
      token_a_mint: analysis.tokenA.mint,
      token_a_symbol: analysis.tokenA.symbol,
      token_b_mint: analysis.tokenB.mint,
      token_b_symbol: analysis.tokenB.symbol,
      risk_score: analysis.riskScore,
      analysis_report: analysis.riskAnalysis,
      reserves_snapshot: serializedReserves,
      transaction_summary: serializedTransactions,
      model_used: analysis.modelUsed,
      tokens_used: analysis.tokensUsed,
      generated_at: analysis.generatedAt,
      user_id: userId || null,
      user_wallet: userWallet || null,  // ✅ YENİ: Kullanıcı cüzdanı
    };

    const { data, error } = await supabase
      .from('pool_analyses')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] ❌ Error saving analysis:', error.message);
      throw error;
    }

    console.log(`[Supabase] ✅ Analysis saved with ID: ${data.id}`);
    return data as PoolAnalysisRecord;

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to save analysis:', error.message);
    return null;
  }
}

/**
 * Get recent analysis for a pool (within specified time window)
 * @param poolId Pool address
 * @param maxAgeMinutes Maximum age in minutes (default: 5)
 * @returns Most recent analysis or null
 */
export async function getRecentAnalysis(
  poolId: string,
  maxAgeMinutes: number = 5
): Promise<PoolAnalysisRecord | null> {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

    console.log(`[Supabase] Checking for recent analysis of pool: ${poolId}`);
    console.log(`[Supabase] Max age: ${maxAgeMinutes} minutes (since ${cutoffTime})`);

    const { data, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .eq('pool_id', poolId)
      .gte('generated_at', cutoffTime)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] ❌ Error fetching analysis:', error.message);
      return null;
    }

    if (data) {
      console.log(`[Supabase] ✅ Found recent analysis (${data.generated_at})`);
    } else {
      console.log(`[Supabase] ℹ️ No recent analysis found`);
    }

    return data as PoolAnalysisRecord | null;

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch recent analysis:', error.message);
    return null;
  }
}

/**
 * Get analysis by ID
 * @param analysisId Analysis record ID
 * @returns Analysis record or null
 */
export async function getAnalysisById(
  analysisId: string
): Promise<PoolAnalysisRecord | null> {
  try {
    const { data, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (error) {
      console.error('[Supabase] ❌ Error fetching analysis by ID:', error.message);
      return null;
    }

    return data as PoolAnalysisRecord;

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch analysis by ID:', error.message);
    return null;
  }
}

/**
 * Get user's analysis history
 * @param userId User ID
 * @param limit Maximum number of records (default: 10)
 * @returns Array of analysis records
 */
/**
 * Get user analyses by wallet address (for API)
 * @param userWallet User's wallet address (Ethereum or Solana)
 * @param limit Maximum number of records (default: 20)
 * @param offset Pagination offset (default: 0)
 * @returns Array of analysis records
 */
export async function getUserAnalyses(
  userWallet: string,
  limit: number = 20,
  offset: number = 0
): Promise<PoolAnalysisRecord[]> {
  try {
    const { data, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .eq('user_wallet', userWallet)
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Supabase] ❌ Error fetching user analyses:', error.message);
      return [];
    }

    return (data as PoolAnalysisRecord[]) || [];

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch user analyses:', error.message);
    return [];
  }
}

export async function getUserAnalysisHistory(
  userId: string,
  limit: number = 10
): Promise<PoolAnalysisRecord[]> {
  try {
    const { data, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] ❌ Error fetching user history:', error.message);
      return [];
    }

    return (data as PoolAnalysisRecord[]) || [];

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch user history:', error.message);
    return [];
  }
}

/**
 * Get high risk pools (risk score > 60)
 * @param limit Maximum number of records (default: 20)
 * @returns Array of high-risk analysis records
 */
export async function getHighRiskPools(limit: number = 20): Promise<PoolAnalysisRecord[]> {
  try {
    const { data, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .gt('risk_score', 60)
      .order('risk_score', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] ❌ Error fetching high risk pools:', error.message);
      return [];
    }

    return (data as PoolAnalysisRecord[]) || [];

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch high risk pools:', error.message);
    return [];
  }
}

/**
 * Get analysis statistics
 * @returns Statistics object
 */
export async function getAnalysisStats(): Promise<{
  totalAnalyses: number;
  last24Hours: number;
  avgRiskScore: number;
  highRiskCount: number;
}> {
  try {
    // Total count
    const { count: totalCount } = await supabase
      .from('pool_analyses')
      .select('*', { count: 'exact', head: true });

    // Last 24 hours count
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recent24h } = await supabase
      .from('pool_analyses')
      .select('*', { count: 'exact', head: true })
      .gte('generated_at', cutoff24h);

    // Average risk score (simplified - calculate from all records)
    const { data: allScores } = await supabase
      .from('pool_analyses')
      .select('risk_score');

    const avgRiskScore = allScores && allScores.length > 0
      ? allScores.reduce((sum, record: any) => sum + (record.risk_score || 0), 0) / allScores.length
      : 50;

    // High risk count
    const { count: highRiskCount } = await supabase
      .from('pool_analyses')
      .select('*', { count: 'exact', head: true })
      .gt('risk_score', 60);

    return {
      totalAnalyses: totalCount || 0,
      last24Hours: recent24h || 0,
      avgRiskScore: Math.round(avgRiskScore),
      highRiskCount: highRiskCount || 0,
    };

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to fetch stats:', error.message);
    return {
      totalAnalyses: 0,
      last24Hours: 0,
      avgRiskScore: 50,
      highRiskCount: 0,
    };
  }
}

/**
 * Delete old analyses (data cleanup)
 * @param daysOld Number of days (default: 30)
 * @returns Number of deleted records
 */
export async function deleteOldAnalyses(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[Supabase] Deleting analyses older than ${daysOld} days (before ${cutoffDate})`);

    const { data, error } = await supabase
      .from('pool_analyses')
      .delete()
      .lt('generated_at', cutoffDate)
      .select();

    if (error) {
      console.error('[Supabase] ❌ Error deleting old analyses:', error.message);
      return 0;
    }

    const deletedCount = data?.length || 0;
    console.log(`[Supabase] ✅ Deleted ${deletedCount} old analyses`);
    return deletedCount;

  } catch (error: any) {
    console.error('[Supabase] ❌ Failed to delete old analyses:', error.message);
    return 0;
  }
}

/**
 * Health check - test database connection
 * @returns True if connection is healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pool_analyses')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] ❌ Health check failed:', error.message);
      return false;
    }

    console.log('[Supabase] ✅ Health check OK');
    return true;

  } catch (error: any) {
    console.error('[Supabase] ❌ Health check exception:', error.message);
    return false;
  }
}

