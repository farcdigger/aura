/**
 * Pool History Tracker - 7 günlük TVL ve volume trend analizi
 * 
 * Bu modül:
 * - Supabase'deki geçmiş analizleri kullanarak trend hesaplar
 * - TVL değişimini izler
 * - Volume trendini analiz eder
 * - Liquidity stability göstergesi sunar
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Historical Pool Data Point
 */
export interface PoolHistoryDataPoint {
  /** Analysis timestamp */
  timestamp: Date;
  /** TVL in USD */
  tvlUSD: number;
  /** Transaction count */
  transactionCount: number;
  /** Buy count */
  buyCount: number;
  /** Sell count */
  sellCount: number;
  /** Risk score */
  riskScore: number;
}

/**
 * Pool History Trend Analysis
 */
export interface PoolHistoryTrend {
  /** Pool address */
  poolId: string;
  /** Number of historical data points found */
  dataPoints: number;
  /** Time span covered (in days) */
  daysTracked: number;
  
  /** TVL Trend */
  tvl: {
    /** Current TVL */
    current: number;
    /** TVL 7 days ago (if available) */
    sevenDaysAgo?: number;
    /** Percentage change */
    changePercent?: number;
    /** Trend direction: up, down, stable */
    trend: 'up' | 'down' | 'stable' | 'unknown';
    /** Human-readable summary */
    summary: string;
  };
  
  /** Volume Trend */
  volume: {
    /** Average daily transaction count */
    avgDailyTransactions: number;
    /** Recent vs historical comparison */
    recentVsHistorical?: number;
    /** Trend direction */
    trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
    /** Human-readable summary */
    summary: string;
  };
  
  /** Liquidity Stability */
  stability: {
    /** Is the pool consistently analyzed? */
    isStable: boolean;
    /** Volatility indicator (0-100, higher = more volatile) */
    volatility: number;
    /** Stability level */
    level: 'highly_stable' | 'stable' | 'moderate' | 'volatile' | 'unknown';
    /** Human-readable summary */
    summary: string;
  };
  
  /** Risk Trend */
  risk: {
    /** Current risk score */
    current: number;
    /** Average historical risk score */
    historicalAvg?: number;
    /** Trend direction */
    trend: 'improving' | 'worsening' | 'stable' | 'unknown';
    /** Human-readable summary */
    summary: string;
  };
  
  /** Historical data points (for charts) */
  history: PoolHistoryDataPoint[];
}

/**
 * Get historical trend analysis for a pool
 * 
 * @param supabase Supabase client
 * @param poolId Pool address
 * @param daysBack How many days to look back (default: 7)
 * @returns PoolHistoryTrend with TVL, volume, and stability analysis
 */
export async function getPoolHistoryTrend(
  supabase: SupabaseClient,
  poolId: string,
  daysBack: number = 7
): Promise<PoolHistoryTrend> {
  console.log(`[PoolHistory] 📊 Analyzing ${daysBack}-day history for pool: ${poolId.slice(0, 8)}...`);
  
  try {
    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);
    
    // Fetch historical analyses from Supabase
    // Note: We'll fetch all columns and parse what we need
    const { data: analyses, error } = await supabase
      .from('pool_analyses')
      .select('*')
      .eq('pool_id', poolId)
      .gte('created_at', dateThreshold.toISOString())
      .order('created_at', { ascending: true })
      .limit(100); // Limit for performance
    
    if (error) {
      console.warn(`[PoolHistory] ⚠️ Supabase query failed: ${error.message}`);
      return createEmptyTrend(poolId);
    }
    
    if (!analyses || analyses.length === 0) {
      console.log(`[PoolHistory] ℹ️ No historical data found for pool (may be first analysis)`);
      return createEmptyTrend(poolId);
    }
    
    console.log(`[PoolHistory] ✅ Found ${analyses.length} historical analyses`);
    
    // Parse data points (flexible schema handling)
    const dataPoints: PoolHistoryDataPoint[] = analyses
      .map(a => {
        try {
          // Try multiple column names and formats
          let reserves: any;
          let transactions: any;
          
          // Try to extract reserves (multiple possible formats)
          if (a.pool_data) {
            const poolData = typeof a.pool_data === 'string' ? JSON.parse(a.pool_data) : a.pool_data;
            reserves = poolData.reserves || poolData;
          } else if (a.analysis_result) {
            const analysisResult = typeof a.analysis_result === 'string' ? JSON.parse(a.analysis_result) : a.analysis_result;
            reserves = analysisResult.reserves;
          } else if (a.reserves) {
            reserves = typeof a.reserves === 'string' ? JSON.parse(a.reserves) : a.reserves;
          }
          
          // Try to extract transactions (multiple possible formats)
          if (a.pool_data) {
            const poolData = typeof a.pool_data === 'string' ? JSON.parse(a.pool_data) : a.pool_data;
            transactions = poolData.transactions;
          } else if (a.analysis_result) {
            const analysisResult = typeof a.analysis_result === 'string' ? JSON.parse(a.analysis_result) : a.analysis_result;
            transactions = analysisResult.transactions;
          } else if (a.transactions) {
            transactions = typeof a.transactions === 'string' ? JSON.parse(a.transactions) : a.transactions;
          }
          
          return {
            timestamp: new Date(a.created_at),
            tvlUSD: reserves?.tvlUSD || reserves?.estimatedTVL || 0,
            transactionCount: transactions?.totalCount || transactions?.totalTransactions || 0,
            buyCount: transactions?.buyCount || 0,
            sellCount: transactions?.sellCount || 0,
            riskScore: a.risk_score || 50,
          };
        } catch (err) {
          console.warn(`[PoolHistory] Failed to parse analysis:`, err);
          return null;
        }
      })
      .filter((dp): dp is PoolHistoryDataPoint => dp !== null);
    
    if (dataPoints.length === 0) {
      console.log(`[PoolHistory] ℹ️ No valid data points after parsing`);
      return createEmptyTrend(poolId);
    }
    
    // Calculate days tracked
    const firstDate = dataPoints[0].timestamp;
    const lastDate = dataPoints[dataPoints.length - 1].timestamp;
    const daysTracked = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Analyze TVL trend
    const tvlTrend = analyzeTVLTrend(dataPoints);
    
    // Analyze volume trend
    const volumeTrend = analyzeVolumeTrend(dataPoints);
    
    // Analyze stability
    const stabilityAnalysis = analyzeStability(dataPoints);
    
    // Analyze risk trend
    const riskTrend = analyzeRiskTrend(dataPoints);
    
    console.log(`[PoolHistory] 📈 Trend Summary:`);
    console.log(`[PoolHistory]    TVL: ${tvlTrend.trend} (${tvlTrend.changePercent?.toFixed(1)}%)`);
    console.log(`[PoolHistory]    Volume: ${volumeTrend.trend}`);
    console.log(`[PoolHistory]    Stability: ${stabilityAnalysis.level}`);
    console.log(`[PoolHistory]    Risk: ${riskTrend.trend}`);
    
    return {
      poolId,
      dataPoints: dataPoints.length,
      daysTracked,
      tvl: tvlTrend,
      volume: volumeTrend,
      stability: stabilityAnalysis,
      risk: riskTrend,
      history: dataPoints,
    };
    
  } catch (error: any) {
    console.error(`[PoolHistory] ❌ Failed to analyze pool history:`, error.message);
    return createEmptyTrend(poolId);
  }
}

/**
 * Analyze TVL trend
 */
function analyzeTVLTrend(dataPoints: PoolHistoryDataPoint[]): PoolHistoryTrend['tvl'] {
  const current = dataPoints[dataPoints.length - 1].tvlUSD;
  const oldest = dataPoints[0].tvlUSD;
  
  if (oldest === 0 || !oldest) {
    return {
      current,
      trend: 'unknown',
      summary: 'Insufficient historical data to determine TVL trend',
    };
  }
  
  const changePercent = ((current - oldest) / oldest) * 100;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (changePercent > 10) {
    trend = 'up';
  } else if (changePercent < -10) {
    trend = 'down';
  }
  
  const summary = `TVL ${trend === 'up' ? '📈 increased' : trend === 'down' ? '📉 decreased' : '➡️ remained stable'} by ${Math.abs(changePercent).toFixed(1)}% over the tracked period`;
  
  return {
    current,
    sevenDaysAgo: oldest,
    changePercent,
    trend,
    summary,
  };
}

/**
 * Analyze volume trend
 */
function analyzeVolumeTrend(dataPoints: PoolHistoryDataPoint[]): PoolHistoryTrend['volume'] {
  const avgDailyTransactions = dataPoints.reduce((sum, dp) => sum + dp.transactionCount, 0) / dataPoints.length;
  
  // Compare recent (last 25%) vs older (first 25%)
  const recentCount = Math.max(1, Math.floor(dataPoints.length * 0.25));
  const recentPoints = dataPoints.slice(-recentCount);
  const olderPoints = dataPoints.slice(0, recentCount);
  
  const recentAvg = recentPoints.reduce((sum, dp) => sum + dp.transactionCount, 0) / recentPoints.length;
  const olderAvg = olderPoints.reduce((sum, dp) => sum + dp.transactionCount, 0) / olderPoints.length;
  
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  let recentVsHistorical: number | undefined;
  
  if (olderAvg > 0) {
    const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;
    recentVsHistorical = changePct;
    
    if (changePct > 20) {
      trend = 'increasing';
    } else if (changePct < -20) {
      trend = 'decreasing';
    }
  } else {
    trend = 'unknown';
  }
  
  const summary = `Average ${avgDailyTransactions.toFixed(0)} transactions per analysis. Activity is ${trend}.`;
  
  return {
    avgDailyTransactions,
    recentVsHistorical,
    trend,
    summary,
  };
}

/**
 * Analyze liquidity stability
 */
function analyzeStability(dataPoints: PoolHistoryDataPoint[]): PoolHistoryTrend['stability'] {
  if (dataPoints.length < 3) {
    return {
      isStable: false,
      volatility: 0,
      level: 'unknown',
      summary: 'Not enough data to assess stability',
    };
  }
  
  // Calculate TVL volatility (coefficient of variation)
  const tvls = dataPoints.map(dp => dp.tvlUSD).filter(tvl => tvl > 0);
  
  if (tvls.length < 2) {
    return {
      isStable: false,
      volatility: 0,
      level: 'unknown',
      summary: 'TVL data not available',
    };
  }
  
  const mean = tvls.reduce((sum, tvl) => sum + tvl, 0) / tvls.length;
  const variance = tvls.reduce((sum, tvl) => sum + Math.pow(tvl - mean, 2), 0) / tvls.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = (stdDev / mean) * 100;
  
  let level: 'highly_stable' | 'stable' | 'moderate' | 'volatile' = 'stable';
  let isStable = true;
  
  if (coefficientOfVariation < 10) {
    level = 'highly_stable';
  } else if (coefficientOfVariation < 25) {
    level = 'stable';
  } else if (coefficientOfVariation < 50) {
    level = 'moderate';
    isStable = false;
  } else {
    level = 'volatile';
    isStable = false;
  }
  
  const summary = `Pool liquidity is ${level.replace('_', ' ')} (${coefficientOfVariation.toFixed(1)}% volatility)`;
  
  return {
    isStable,
    volatility: coefficientOfVariation,
    level,
    summary,
  };
}

/**
 * Analyze risk trend
 */
function analyzeRiskTrend(dataPoints: PoolHistoryDataPoint[]): PoolHistoryTrend['risk'] {
  const current = dataPoints[dataPoints.length - 1].riskScore;
  const historicalAvg = dataPoints.reduce((sum, dp) => sum + dp.riskScore, 0) / dataPoints.length;
  
  const diff = current - historicalAvg;
  
  let trend: 'improving' | 'worsening' | 'stable' = 'stable';
  if (diff < -5) {
    trend = 'improving';
  } else if (diff > 5) {
    trend = 'worsening';
  }
  
  const summary = trend === 'improving' 
    ? `✅ Risk is improving (current: ${current}, avg: ${historicalAvg.toFixed(1)})`
    : trend === 'worsening'
    ? `⚠️ Risk is worsening (current: ${current}, avg: ${historicalAvg.toFixed(1)})`
    : `➡️ Risk is stable (current: ${current})`;
  
  return {
    current,
    historicalAvg,
    trend,
    summary,
  };
}

/**
 * Create empty trend object when no data is available
 */
function createEmptyTrend(poolId: string): PoolHistoryTrend {
  return {
    poolId,
    dataPoints: 0,
    daysTracked: 0,
    tvl: {
      current: 0,
      trend: 'unknown',
      summary: 'No historical data available (this may be the first analysis)',
    },
    volume: {
      avgDailyTransactions: 0,
      trend: 'unknown',
      summary: 'No historical transaction data',
    },
    stability: {
      isStable: false,
      volatility: 0,
      level: 'unknown',
      summary: 'Insufficient data to assess stability',
    },
    risk: {
      current: 0,
      trend: 'unknown',
      summary: 'No historical risk data',
    },
    history: [],
  };
}

