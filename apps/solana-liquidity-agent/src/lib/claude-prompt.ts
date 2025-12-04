import type {
  TokenMetadata,
  AdjustedPoolReserves,
  TransactionSummary,
  PoolHistoryTrend,
} from './types';

// =============================================================================
// PROMPT BUILDER FOR CLAUDE AI
// =============================================================================

/**
 * Build comprehensive analysis prompt for Claude
 * This prompt guides the LLM to perform detailed risk assessment
 */
export function buildAnalysisPrompt(params: {
  poolId: string;
  tokenA: TokenMetadata;
  tokenB: TokenMetadata;
  reserves: AdjustedPoolReserves;
  transactions: TransactionSummary;
  poolHistory?: PoolHistoryTrend;
}): string {
  const { poolId, tokenA, tokenB, reserves, transactions, poolHistory } = params;
  // Calculate derived metrics
  const totalTransactions = transactions.totalCount;
  const buyRatio = totalTransactions > 0 ? (transactions.buyCount / totalTransactions) * 100 : 0;
  const sellRatio = totalTransactions > 0 ? (transactions.sellCount / totalTransactions) * 100 : 0;
  
  // Time range info
  const timeRangeText = transactions.timeRange
    ? `${transactions.timeRange.earliest.toISOString()} to ${transactions.timeRange.latest.toISOString()}`
    : 'Not available';

  // Top wallet concentration
  const topWalletShare = transactions.topWallets[0]?.volumeShare || 0;
  const topWalletsText = transactions.topWallets
    .slice(0, 5)
    .map((w, i) => `${i + 1}. ${w.address.substring(0, 8)}... - ${w.txCount} transactions (${w.volumeShare.toFixed(1)}% of volume)`)
    .join('\n');

  // PHASE 3: Wallet Profiles
  const walletProfilesSection = transactions.walletProfiles && transactions.walletProfiles.length > 0
    ? `\n\n**🔍 WALLET PROFILES (Advanced Analysis - Phase 3):**

${transactions.walletProfiles.map((profile, i) => {
  const riskEmoji = profile.riskLevel === 'high' ? '🔴' : profile.riskLevel === 'medium' ? '🟡' : '🟢';
  const botEmoji = profile.isLikelyBot ? '🤖 BOT' : '👤 HUMAN';
  const whaleEmoji = profile.isWhale ? '🐋 WHALE' : '';
  
  return `${i + 1}. **${profile.address.substring(0, 8)}...** ${riskEmoji} ${profile.riskLevel.toUpperCase()} RISK
   - ${profile.summary}
   - ${botEmoji} ${whaleEmoji}
   - Age: ${profile.ageInDays} days | Total TX: ${profile.totalTransactions} | Avg: ${profile.avgTxPerDay.toFixed(1)} tx/day`;
}).join('\n\n')}

**Risk Indicators:**
- 🔴 High Risk: Bot + Whale, new account with high activity
- 🟡 Medium Risk: Whale or bot activity, or new account
- 🟢 Low Risk: Established account, normal activity

`
    : '';

  // PHASE 3: Historical Trend
  const historicalTrendSection = poolHistory && poolHistory.dataPoints > 0
    ? `\n\n## 📈 HISTORICAL TREND ANALYSIS (Phase 3 - Last ${poolHistory.daysTracked} days)

**Data Points:** ${poolHistory.dataPoints} analyses over ${poolHistory.daysTracked} days

### TVL Trend:
- **Current TVL:** $${poolHistory.tvl.current.toLocaleString()}
${poolHistory.tvl.sevenDaysAgo ? `- **7 Days Ago:** $${poolHistory.tvl.sevenDaysAgo.toLocaleString()}` : ''}
${poolHistory.tvl.changePercent ? `- **Change:** ${poolHistory.tvl.changePercent.toFixed(1)}%` : ''}
- **Trend:** ${poolHistory.tvl.trend === 'up' ? '📈 INCREASING' : poolHistory.tvl.trend === 'down' ? '📉 DECREASING' : '➡️ STABLE'}
- **Summary:** ${poolHistory.tvl.summary}

### Volume Trend:
- **Avg Daily Transactions:** ${poolHistory.volume.avgDailyTransactions.toFixed(0)}
${poolHistory.volume.recentVsHistorical ? `- **Recent vs Historical:** ${poolHistory.volume.recentVsHistorical.toFixed(1)}%` : ''}
- **Trend:** ${poolHistory.volume.trend.toUpperCase()}
- **Summary:** ${poolHistory.volume.summary}

### Liquidity Stability:
- **Stability Level:** ${poolHistory.stability.level.replace('_', ' ').toUpperCase()}
- **Volatility:** ${poolHistory.stability.volatility.toFixed(1)}%
- **Is Stable:** ${poolHistory.stability.isStable ? '✅ Yes' : '⚠️ No'}
- **Summary:** ${poolHistory.stability.summary}

### Risk Trend:
- **Current Risk Score:** ${poolHistory.risk.current}/100
${poolHistory.risk.historicalAvg ? `- **Historical Average:** ${poolHistory.risk.historicalAvg.toFixed(1)}/100` : ''}
- **Trend:** ${poolHistory.risk.trend === 'improving' ? '✅ IMPROVING' : poolHistory.risk.trend === 'worsening' ? '⚠️ WORSENING' : '➡️ STABLE'}
- **Summary:** ${poolHistory.risk.summary}

**⚠️ IMPORTANT:** Use this historical data to contextualize current risks. A stable history with good trends is a positive indicator.

`
    : '\n\n## 📈 HISTORICAL TREND ANALYSIS\n\n**No historical data available.** This may be the first analysis of this pool. Exercise extra caution with new pools.\n\n';

  // Suspicious patterns
  const suspiciousPatternsText = transactions.suspiciousPatterns.length > 0
    ? transactions.suspiciousPatterns.map(p => `⚠️ ${p}`).join('\n')
    : '✅ No obvious suspicious patterns detected';

  // Authority checks
  const freezeAuthorityWarning = tokenA.authorities?.freezeAuthority || tokenB.authorities?.freezeAuthority
    ? '🚨 WARNING: One or both tokens have FREEZE AUTHORITY enabled - tokens can be frozen!'
    : '✅ No freeze authority detected';
  
  const mintAuthorityWarning = tokenA.authorities?.mintAuthority || tokenB.authorities?.mintAuthority
    ? '⚠️ WARNING: One or both tokens have MINT AUTHORITY enabled - supply can be inflated!'
    : '✅ No mint authority detected';

  // Pool health section (NEW)
  const poolHealthSection = `
## 🏊 POOL HEALTH METRICS

**Pool Type:** ${reserves.poolType || 'Raydium AMM V4'}
**Pool Status:** ${reserves.poolStatus || 'Active'}
**LP Token Supply:** ${reserves.lpSupply || 'Unknown'}
**Swap Fee:** ${reserves.feeInfo || '0.25% (standard)'}

**Liquidity Depth:**
- **${tokenA.symbol} Reserve:** ${reserves.tokenAReserve.toLocaleString()} tokens
- **${tokenB.symbol} Reserve:** ${reserves.tokenBReserve.toLocaleString()} tokens
${reserves.tvlUSD && reserves.tvlUSD > 0 ? `- **Estimated TVL:** $${reserves.tvlUSD.toLocaleString()} USD` : '- **Estimated TVL:** Not available (price data pending)'}

**Liquidity Risk Interpretation:**
- **Deep liquidity (>$1M TVL):** Low slippage, safer for large trades
- **Medium liquidity ($100K-$1M):** Moderate slippage risk
- **Shallow liquidity ($10K-$100K):** High slippage, caution advised
- **Very low liquidity (<$10K):** CRITICAL: Very high slippage risk
- **Zero LP supply:** CRITICAL: Pool may be drained or inactive

${reserves.poolStatus === 'Disabled' ? '🚨 **WARNING:** This pool is currently DISABLED by authority!' : ''}
${!reserves.lpSupply || reserves.lpSupply === '0' ? '🚨 **WARNING:** Zero LP supply detected - pool may be inactive or drained!' : ''}
`;

  // Build the comprehensive prompt
  const prompt = `You are an expert Solana DeFi security analyst specializing in liquidity pool risk assessment. Your task is to analyze a Raydium liquidity pool and provide a comprehensive risk report.

## 🎯 ANALYSIS OBJECTIVE

Evaluate the provided pool data and generate a detailed risk assessment covering:
1. Liquidity health and stability
2. Token security (rug pull indicators)
3. Trading activity patterns
4. Manipulation risks (wash trading, pump & dump)
5. Wallet concentration risks

**IMPORTANT:** Base your analysis ONLY on the provided data. Do not make assumptions or provide financial advice.

---

## 📊 POOL INFORMATION

**Pool Address:** \`${poolId}\`

### Token A: ${tokenA.name} (${tokenA.symbol})
- **Mint Address:** \`${tokenA.mint}\`
- **Decimals:** ${tokenA.decimals}
- **Freeze Authority:** ${tokenA.authorities?.freezeAuthority || 'None'}
- **Mint Authority:** ${tokenA.authorities?.mintAuthority || 'None'}

### Token B: ${tokenB.name} (${tokenB.symbol})
- **Mint Address:** \`${tokenB.mint}\`
- **Decimals:** ${tokenB.decimals}
- **Freeze Authority:** ${tokenB.authorities?.freezeAuthority || 'None'}
- **Mint Authority:** ${tokenB.authorities?.mintAuthority || 'None'}

---

${poolHealthSection}

---
${historicalTrendSection}
---

## 📈 TRANSACTION ANALYSIS (Last ${totalTransactions} Transactions)

**Time Range:** ${timeRangeText}

**Trade Distribution:**
- **Buy Transactions:** ${transactions.buyCount} (${buyRatio.toFixed(1)}%)
- **Sell Transactions:** ${transactions.sellCount} (${sellRatio.toFixed(1)}%)
- **Average Volume:** ${transactions.avgVolumeUSD > 0 ? `$${transactions.avgVolumeUSD.toLocaleString()}` : 'Not available'}

**Top 5 Active Wallets:**
${topWalletsText}
${walletProfilesSection}
**Wallet Concentration:**
- Top wallet controls: **${topWalletShare.toFixed(1)}%** of transaction volume
- Risk threshold: >30% concentration = High manipulation risk

---

## 🚨 SECURITY ALERTS

**Token Authority Status:**
${freezeAuthorityWarning}
${mintAuthorityWarning}

**Detected Patterns:**
${suspiciousPatternsText}

---

## 📋 ANALYSIS INSTRUCTIONS

Please provide a comprehensive risk assessment in the following format:

### 1. RISK SCORE (Required - First Line)
Provide a numerical risk score from 0-100:
- **0-20:** Very Low Risk (Highly trustworthy pool)
- **21-40:** Low Risk (Generally safe with minor concerns)
- **41-60:** Medium Risk (Proceed with caution)
- **61-80:** High Risk (Significant red flags present)
- **81-100:** Critical Risk (Strong rug pull/scam indicators)

**Format:** Risk Score: [NUMBER]

### 2. EXECUTIVE SUMMARY (2-3 sentences)
Provide a high-level overview of the pool's risk profile.

### 3. DETAILED ANALYSIS

#### A. Liquidity Health Analysis
- Evaluate reserve amounts
- Assess liquidity depth
- Identify slippage risks
- Comment on pool stability

#### B. Token Security Analysis
- Analyze freeze/mint authority presence
- Assess rug pull risk
- Evaluate token distribution
- Check for honeypot indicators

#### C. Trading Activity Analysis
- Analyze buy/sell ratio (is it balanced?)
- Evaluate transaction patterns
- Identify unusual trading behavior
- Assess market sentiment

#### D. Manipulation Risk Analysis
- Check for wash trading indicators
- Evaluate wallet concentration
- Identify pump & dump patterns
- Assess bot activity risks
- **PHASE 3:** Analyze wallet profiles (age, activity, bot/human classification)
- **PHASE 3:** Evaluate whale wallet risk based on account history

### 4. KEY FINDINGS (Bullet Points)
List 3-5 most critical findings, both positive and negative.

### 5. RISK WARNINGS (If Applicable)
Clearly state any high-priority risks that users should be aware of.

### 6. RECOMMENDATIONS
Provide actionable guidance:
- Should users proceed with this pool?
- What precautions should be taken?
- What additional due diligence is needed?

---

## ⚠️ IMPORTANT GUIDELINES

1. **Be Objective:** Base analysis strictly on provided data
2. **No Financial Advice:** Never say "buy" or "sell" - only assess risks
3. **Use Specific Numbers:** Quote actual metrics from the data
4. **Explain Reasoning:** For each risk, explain WHY it's concerning
5. **Acknowledge Limitations:** Note what data is unavailable
6. **Use Clear Language:** Write for both beginners and experts
7. **Markdown Formatting:** Use headers, bold, lists for readability

---

## 🎯 BEGIN ANALYSIS

Generate your comprehensive risk assessment now:`;

  return prompt;
}

/**
 * Parse risk score from Claude's response
 * Looks for patterns like "Risk Score: 45" or "**Risk Score:** 45/100"
 */
export function parseRiskScore(analysisText: string): number {
  // Try multiple regex patterns
  const patterns = [
    /Risk\s+Score\s*:?\s*(\d+)/i,
    /Score\s*:?\s*(\d+)/i,
    /\*\*Risk\s+Score\*\*\s*:?\s*(\d+)/i,
    /Risk\s+Level\s*:?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = analysisText.match(pattern);
    if (match && match[1]) {
      const score = parseInt(match[1], 10);
      // Validate score is in valid range
      if (score >= 0 && score <= 100) {
        return score;
      }
    }
  }

  // Fallback: look for score in first 500 characters
  const firstPart = analysisText.substring(0, 500);
  const numbers = firstPart.match(/\b(\d{1,2}|100)\b/g);
  
  if (numbers && numbers.length > 0) {
    const potentialScore = parseInt(numbers[0], 10);
    if (potentialScore >= 0 && potentialScore <= 100) {
      console.warn('[Prompt] Risk score parsed from fallback method:', potentialScore);
      return potentialScore;
    }
  }

  // Default fallback: medium risk
  console.warn('[Prompt] Could not parse risk score, defaulting to 50');
  return 50;
}

/**
 * Validate that the analysis contains all required sections
 */
export function validateAnalysisResponse(analysisText: string): {
  isValid: boolean;
  missingSections: string[];
} {
  const requiredSections = [
    'Risk Score',
    'Summary',
    'Liquidity',
    'Security',
    'Trading',
    'Manipulation',
  ];

  const missingSections: string[] = [];

  for (const section of requiredSections) {
    const hasSection = analysisText.toLowerCase().includes(section.toLowerCase());
    if (!hasSection) {
      missingSections.push(section);
    }
  }

  return {
    isValid: missingSections.length === 0,
    missingSections,
  };
}

/**
 * Generate a fallback analysis if LLM fails
 */
export function generateFallbackAnalysis(
  poolId: string,
  tokenA: TokenMetadata,
  tokenB: TokenMetadata,
  transactions: TransactionSummary
): { analysis: string; riskScore: number } {
  const hasAuthorities = 
    tokenA.authorities?.freezeAuthority || 
    tokenA.authorities?.mintAuthority ||
    tokenB.authorities?.freezeAuthority ||
    tokenB.authorities?.mintAuthority;

  const highWalletConcentration = (transactions.topWallets[0]?.volumeShare || 0) > 30;
  const extremeBuyRatio = transactions.buyCount / transactions.totalCount > 0.8;
  const extremeSellRatio = transactions.sellCount / transactions.totalCount > 0.8;

  let riskScore = 50; // Base medium risk
  
  if (hasAuthorities) riskScore += 20;
  if (highWalletConcentration) riskScore += 15;
  if (extremeBuyRatio || extremeSellRatio) riskScore += 10;
  
  riskScore = Math.min(riskScore, 100);

  const analysis = `# Risk Assessment for ${tokenA.symbol}/${tokenB.symbol}

**Risk Score: ${riskScore}/100**

## ⚠️ Analysis System Notice

This is a fallback analysis generated due to AI system limitations. For a complete analysis, please try again.

## Pool Information

- **Pool ID:** ${poolId}
- **Tokens:** ${tokenA.symbol} / ${tokenB.symbol}
- **Analyzed Transactions:** ${transactions.totalCount}

## Quick Risk Indicators

${hasAuthorities ? '🚨 **High Risk:** Token authorities detected (freeze/mint enabled)' : '✅ No dangerous token authorities detected'}

${highWalletConcentration ? '⚠️ **Warning:** High wallet concentration detected' : '✅ Normal wallet distribution'}

${extremeBuyRatio ? '⚠️ **Warning:** Extremely high buy ratio (potential pump)' : ''}
${extremeSellRatio ? '⚠️ **Warning:** Extremely high sell ratio (potential dump)' : ''}

## Recommendation

Based on automated checks, this pool has a risk score of ${riskScore}/100. Please conduct additional research before interacting with this pool.

---

*This is an automated fallback analysis. For comprehensive analysis, the system will retry shortly.*`;

  return { analysis, riskScore };
}

