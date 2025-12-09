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
  // Check if LP supply is actually zero (not just missing)
  const lpSupplyValue = reserves.lpSupply;
  const hasZeroLP = lpSupplyValue === '0' || lpSupplyValue === '0.00' || (lpSupplyValue && parseFloat(lpSupplyValue) === 0);
  const hasValidLP = lpSupplyValue && !hasZeroLP;
  
  const poolHealthSection = `
## 🏊 POOL HEALTH METRICS

**Pool Type:** ${reserves.poolType || 'Raydium AMM V4'}
**Pool Status:** ${reserves.poolStatus || 'Active'}
**LP Token Supply:** ${hasValidLP ? lpSupplyValue : 'Not available (calculated from reserves)'}
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
${hasZeroLP ? '🚨 **WARNING:** Zero LP supply detected - pool may be inactive or drained!' : ''}
${hasValidLP && reserves.tokenAReserve > 0 && reserves.tokenBReserve > 0 ? '✅ **LP supply and reserves indicate active liquidity**' : ''}
`;

  // Build the comprehensive prompt
  const prompt = `You are an expert cryptocurrency analyst who explains complex DeFi risks in simple, easy-to-understand language. Your job is to analyze a Solana token's liquidity pool and write a clear, engaging risk report that anyone can understand.

## 🎯 YOUR MISSION

Write a risk report that:
- Uses simple, everyday language (avoid technical jargon)
- Highlights the most important red flags and green flags
- Explains what the data means in plain English
- Makes it easy for regular people to decide if this token is safe to trade

**CRITICAL:** Only use the data provided. Don't make up information. Write like you're explaining to a friend, not a technical expert.

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

## 📋 HOW TO WRITE THE REPORT

Write your report in this exact format:

### 1. RISK SCORE (Required - First Line)
Give a number from 0-100:
- **0-20:** Very Safe (You can probably trust this)
- **21-40:** Mostly Safe (Small concerns, but probably okay)
- **41-60:** Be Careful (Some warning signs)
- **61-80:** Dangerous (Lots of red flags)
- **81-100:** Very Dangerous (Strong scam/rug pull signs)

**Format:** Risk Score: [NUMBER]

### 2. QUICK SUMMARY (2-3 sentences)
Give a simple overview: Is this token safe? What's the biggest concern?

### 3. WHAT YOU NEED TO KNOW

Write this section in simple language. Explain each point like you're talking to someone who's new to crypto:

#### 💰 Is There Enough Money in the Pool?
- Can you easily buy/sell without losing money on price changes?
- Is there enough money locked in the pool?
- Explain in simple terms: "There's $X in the pool, which means..."

#### 🔒 Is This Token Safe?
- Can the creators freeze your tokens? (Bad sign!)
- Can they print more tokens? (Very bad sign!)
- Is this a scam waiting to happen?
- Use simple language: "The creators can/cannot do X, which means..."

#### 📊 What's Happening with Trading?
- Are more people buying or selling?
- Are the trades real or fake?
- Is someone manipulating the price?
- Explain clearly: "We see X% buying vs Y% selling, which suggests..."

#### 🚨 Are People Cheating?
- Are there fake trades to make it look popular?
- Is one person controlling too much?
- Are bots trading instead of real people?
- Are there rapid buy-sell cycles (someone buying and selling quickly)?
- Are there large single transactions (whale dumps or pumps)?
- Is trading activity concentrated in specific times (coordinated pumps)?
- Are there many new wallets with only 1-2 trades (bot farms)?
- Are there sudden volume spikes (pump events)?
- Is the price changing very rapidly (manipulation)?
- Make it clear: "We found X suspicious patterns, which means..."

### 4. 🎯 KEY INSIGHTS (The Most Important Things)

List 5-8 eye-catching findings. Make them stand out! Examples:
- "⚠️ WARNING: We found 6 wallets doing fake trades to pump the price"
- "✅ GOOD NEWS: No one can freeze your tokens or print more"
- "🚨 DANGER: One wallet controls 45% of all trades - this is risky!"
- "💡 INTERESTING: 80% of trades are buys, suggesting people are optimistic"
- "🐋 WHALE ALERT: Large transactions detected - someone moved $50K+ in a single trade"
- "⏰ TIMING PATTERN: 30% of trades happened in one hour - possible coordinated pump"
- "🤖 BOT DETECTION: Many trades have identical sizes - likely automated trading"
- "📈 VOLATILITY: Price swings >10% on 25% of trades - high manipulation risk"
- "🆕 NEW WALLETS: 60% of wallets have only 1-2 trades - possible fake accounts"

### 5. ⚠️ WARNINGS (If There Are Any)

If there are serious problems, list them clearly:
- "DO NOT invest more than you can afford to lose"
- "This pool has very little money - you might lose 20%+ on every trade"
- "We detected fake trading activity - the price might be manipulated"

### 6. 💡 WHAT SHOULD YOU DO?

Give clear, simple advice:
- Should people trade this token? (Yes/No/Maybe, and why)
- What should they watch out for?
- What questions should they ask before investing?

---

## ✍️ WRITING RULES

1. **Use Simple Words:** Say "money" not "liquidity", "safe" not "secure", "fake trades" not "wash trading"
2. **Explain Everything:** Don't assume people know what "slippage" or "rug pull" means - explain it!
3. **Be Honest:** If something is dangerous, say it clearly. If it's safe, say that too.
4. **Use Numbers:** "6 fake trades" is better than "some fake trades"
5. **Make It Interesting:** Use emojis, bold text, and clear sections to make it easy to read
6. **No Financial Advice:** Don't tell people to buy or sell - just tell them the risks
7. **Be Helpful:** Help people understand what the data means for them

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

