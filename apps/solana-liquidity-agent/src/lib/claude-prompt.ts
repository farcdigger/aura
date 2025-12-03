import type {
  TokenMetadata,
  AdjustedPoolReserves,
  TransactionSummary,
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
}): string {
  const { poolId, tokenA, tokenB, reserves, transactions } = params;
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

## 💧 LIQUIDITY DATA

**Current Reserves:**
- **${tokenA.symbol} Reserve:** ${reserves.tokenAReserve.toLocaleString()} tokens
- **${tokenB.symbol} Reserve:** ${reserves.tokenBReserve.toLocaleString()} tokens
${reserves.tvlUSD ? `- **Total Value Locked (TVL):** $${reserves.tvlUSD.toLocaleString()}` : '- **TVL:** Not available'}

**Liquidity Assessment Notes:**
- Low liquidity (< $10,000) = High slippage risk
- Medium liquidity ($10k - $100k) = Moderate risk
- High liquidity (> $100k) = Lower slippage risk

---

## 📈 TRANSACTION ANALYSIS (Last ${totalTransactions} Transactions)

**Time Range:** ${timeRangeText}

**Trade Distribution:**
- **Buy Transactions:** ${transactions.buyCount} (${buyRatio.toFixed(1)}%)
- **Sell Transactions:** ${transactions.sellCount} (${sellRatio.toFixed(1)}%)
- **Average Volume:** ${transactions.avgVolumeUSD > 0 ? `$${transactions.avgVolumeUSD.toLocaleString()}` : 'Not available'}

**Top 5 Active Wallets:**
${topWalletsText}

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

