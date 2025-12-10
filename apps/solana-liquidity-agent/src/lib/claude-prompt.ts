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
  
  // ✅ KRİTİK KONTROL: reserves'in tanımlı olduğundan emin ol
  if (!reserves) {
    throw new Error('reserves parameter is required but was not provided to buildAnalysisPrompt');
  }
  
  // ============================================================================
  // ADVANCED FEATURE ENGINEERING - Calculate derived metrics for deep analysis
  // ============================================================================
  
  const totalTransactions = transactions.totalCount;
  const buyRatio = totalTransactions > 0 ? (transactions.buyCount / totalTransactions) * 100 : 0;
  const sellRatio = totalTransactions > 0 ? (transactions.sellCount / totalTransactions) * 100 : 0;
  
  // Calculate total USD volume (buy + sell)
  const totalUsdVolume = transactions.topWallets.reduce((sum, w) => sum + (w.volumeUSD || 0), 0);
  const avgTransactionSize = totalUsdVolume > 0 && totalTransactions > 0 ? totalUsdVolume / totalTransactions : 0;
  
  // Calculate buy vs sell USD volume (not just count)
  const buyVolumeUSD = transactions.topWallets.reduce((sum, w) => {
    // Estimate: if wallet has more buys, assume most volume is from buys
    const buyVolumeEstimate = w.buyCount > w.sellCount ? (w.volumeUSD || 0) * (w.buyCount / (w.buyCount + w.sellCount)) : 0;
    return sum + buyVolumeEstimate;
  }, 0);
  const sellVolumeUSD = totalUsdVolume - buyVolumeUSD;
  const buyVolumeRatio = totalUsdVolume > 0 ? (buyVolumeUSD / totalUsdVolume) * 100 : 0;
  
  // Calculate liquidity-to-market-cap ratio (estimate market cap from TVL)
  // For memecoins, market cap is often 3-5x TVL (rough estimate)
  const tvlUSD = reserves?.tvlUSD || 0;
  const estimatedMarketCap = tvlUSD > 0 ? tvlUSD * 3.5 : 0; // Conservative estimate
  const liquidityToMarketCapRatio = estimatedMarketCap > 0 ? (tvlUSD / estimatedMarketCap) * 100 : 0;
  
  // Calculate wallet diversity metrics
  const uniqueWallets = transactions.uniqueWallets;
  const avgTradesPerWallet = uniqueWallets > 0 ? totalTransactions / uniqueWallets : 0;
  const newWalletRatio = transactions.topWallets.filter(w => w.txCount <= 2).length / Math.max(uniqueWallets, 1) * 100;
  
  // Calculate time-based metrics
  const timeRangeDays = transactions.timeRange 
    ? (transactions.timeRange.latest.getTime() - transactions.timeRange.earliest.getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const avgDailyTransactions = timeRangeDays > 0 ? totalTransactions / timeRangeDays : 0;
  const avgDailyVolume = timeRangeDays > 0 ? totalUsdVolume / timeRangeDays : 0;
  
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

  // High-value buyers and sellers analysis
  const highValueBuyersText = transactions.highValueBuyers && transactions.highValueBuyers.length > 0
    ? transactions.highValueBuyers.slice(0, 10).map((buyer, i) => {
        const soldAfter = buyer.hasSoldAfterBuy 
          ? `⚠️ SOLD after buying (${buyer.sellAfterBuyCount} sells)` 
          : `✅ HOLDING (no sells after buy)`;
        return `${i + 1}. **${buyer.address}** - Total: $${buyer.totalBuyVolume.toFixed(2)} | Largest: $${buyer.largestBuy.toFixed(2)} | ${buyer.buyCount} buys | ${soldAfter}`;
      }).join('\n')
    : 'No high-value buyers detected (threshold: 5x average transaction size)';

  const highValueSellersText = transactions.highValueSellers && transactions.highValueSellers.length > 0
    ? transactions.highValueSellers.slice(0, 10).map((seller, i) => {
        const boughtAfter = seller.hasBoughtAfterSell
          ? `🔄 RE-ENTERED (${seller.buyAfterSellCount} buys after sell)`
          : `🚪 EXITED (no buys after sell)`;
        return `${i + 1}. **${seller.address}** - Total: $${seller.totalSellVolume.toFixed(2)} | Largest: $${seller.largestSell.toFixed(2)} | ${seller.sellCount} sells | ${boughtAfter}`;
      }).join('\n')
    : 'No high-value sellers detected (threshold: 5x average transaction size)';

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
  const lpSupplyValue = reserves?.lpSupply;
  const hasZeroLP = lpSupplyValue === '0' || lpSupplyValue === '0.00' || (lpSupplyValue && parseFloat(lpSupplyValue) === 0);
  const hasValidLP = lpSupplyValue && !hasZeroLP;
  
  const poolHealthSection = `
## 🏊 POOL HEALTH METRICS

**Pool Type:** ${reserves?.poolType || 'Raydium AMM V4'}
**Pool Status:** ${reserves?.poolStatus || 'Active'}
**LP Token Supply:** ${hasValidLP ? lpSupplyValue : 'Not available (calculated from reserves)'}
**Swap Fee:** ${reserves?.feeInfo || '0.25% (standard)'}

**Liquidity Depth:**
- **${tokenA.symbol} Reserve:** ${reserves?.tokenAReserve?.toLocaleString() || '0'} tokens
- **${tokenB.symbol} Reserve:** ${reserves?.tokenBReserve?.toLocaleString() || '0'} tokens
${tvlUSD > 0 ? `- **Estimated TVL:** $${tvlUSD.toLocaleString()} USD` : '- **Estimated TVL:** Not available (price data pending)'}

**Liquidity Risk Interpretation:**
- **Deep liquidity (>$1M TVL):** Low slippage, safer for large trades
- **Medium liquidity ($100K-$1M):** Moderate slippage risk
- **Shallow liquidity ($10K-$100K):** High slippage, caution advised
- **Very low liquidity (<$10K):** CRITICAL: Very high slippage risk
- **Zero LP supply:** CRITICAL: Pool may be drained or inactive

${reserves?.poolStatus === 'Disabled' ? '🚨 **WARNING:** This pool is currently DISABLED by authority!' : ''}
${hasZeroLP ? '🚨 **WARNING:** Zero LP supply detected - pool may be inactive or drained!' : ''}
${hasValidLP && reserves?.tokenAReserve > 0 && reserves?.tokenBReserve > 0 ? '✅ **LP supply and reserves indicate active liquidity**' : ''}
`;

  // Build advanced metrics section
  const advancedMetricsSection = `
## 🔬 ADVANCED METRICS & FEATURE ENGINEERING

**IMPORTANT:** You must analyze these calculated metrics deeply. Don't just report them - interpret what they mean!

### Trading Volume Analysis:
- **Total USD Volume:** $${totalUsdVolume.toLocaleString()}
- **Average Transaction Size:** $${avgTransactionSize.toFixed(2)}
- **Buy Volume (USD):** $${buyVolumeUSD.toLocaleString()} (${buyVolumeRatio.toFixed(1)}% of total volume)
- **Sell Volume (USD):** $${sellVolumeUSD.toLocaleString()} (${(100 - buyVolumeRatio).toFixed(1)}% of total volume)
- **Key Insight:** Compare buy/sell RATIOS vs buy/sell VOLUMES. High buy count but low buy volume = small retail traders. High buy volume = real money flowing in.

### Liquidity Health:
- **Pool TVL:** $${tvlUSD.toLocaleString()}
- **Estimated Market Cap:** $${estimatedMarketCap.toLocaleString()} (rough estimate: TVL × 3.5 for memecoins)
- **Liquidity-to-Market Cap Ratio:** ${liquidityToMarketCapRatio.toFixed(1)}%
- **Key Insight:** For memecoins, 20-30% liquidity ratio is HEALTHY. Below 10% = risky. Above 50% = unusual but could be good.

### Wallet Distribution:
- **Unique Wallets:** ${uniqueWallets}
- **Average Trades per Wallet:** ${avgTradesPerWallet.toFixed(1)}
- **New Wallets (1-2 trades):** ${newWalletRatio.toFixed(1)}% of all wallets
- **Key Insight:** High new wallet ratio could mean NEW INVESTORS (good) OR bot farm (bad). Analyze transaction patterns to distinguish!

### Trading Activity:
- **Time Range:** ${timeRangeDays.toFixed(1)} days
- **Average Daily Transactions:** ${avgDailyTransactions.toFixed(1)} trades/day
- **Average Daily Volume:** $${avgDailyVolume.toLocaleString()}/day
- **Key Insight:** Compare transaction count vs volume. Many small trades = retail interest. Few large trades = whale activity.
`;

  // Build the comprehensive prompt
  const prompt = `You are an EXPERT CRYPTOCURRENCY DATA ANALYST and RISK ASSESSOR. Your job is to perform DEEP FEATURE ENGINEERING on the provided data and generate insights that go beyond surface-level observations.

## 🎯 YOUR MISSION

You are NOT just reporting data - you are a DATA SCIENTIST analyzing patterns. Your report must:

1. **PERFORM FEATURE ENGINEERING:** Calculate new metrics from raw data, find correlations, identify anomalies
2. **DEEP ANALYSIS:** Don't just say "80% buys" - analyze WHY. Is it retail FOMO? Whale accumulation? Bot manipulation?
3. **CONTEXTUAL INTERPRETATION:** A $45K pool for a $150K market cap token is NORMAL (30% ratio). Don't call it "low liquidity" without context!
4. **NON-OBVIOUS INSIGHTS:** Everyone can see "many new wallets" - you must determine if they're real investors or bots
5. **VOLUME vs COUNT:** Transaction COUNT and USD VOLUME tell different stories. Analyze BOTH!

**CRITICAL RULES:**
- Use the ADVANCED METRICS section to perform deep analysis
- Don't make obvious statements - find hidden patterns
- Compare ratios, not just absolute numbers
- Consider market context (memecoin vs established token)
- Distinguish between correlation and causation

**🎨 CREATIVITY & INNOVATION - UNLIMITED ANALYTICAL FREEDOM:**
You are an EXPERT DATA ANALYST and FORENSIC INVESTIGATOR with UNLIMITED CREATIVITY. You are not bound by standard analysis - you are a data scientist who extracts maximum value from every piece of information.

**YOUR MISSION:**
- **Think like a forensic investigator:** Connect seemingly unrelated data points to reveal hidden truths
- **Calculate new metrics on the fly:** Don't just use provided metrics - create new ones (e.g., "If we calculate X divided by Y, we get Z which reveals...")
- **Make bold predictions:** Based on patterns, predict what will happen next (e.g., "Given that 80% of holders are in profit and velocity is increasing, we predict a profit-taking event within 24-48 hours")
- **Find hidden correlations:** Look for relationships others miss (e.g., "Notice how transaction size decreases as price increases - this suggests retail FOMO")
- **Tell the complete story:** Don't just report facts - explain what they mean, why they matter, and what they predict

**EXAMPLES OF CREATIVE ANALYSIS:**
- "If we calculate the ratio of new wallets to total volume, we get 0.15, which is 3x higher than typical memecoins - this suggests genuine viral growth"
- "The average transaction size is $45, but during price spikes it drops to $12 - this is classic retail FOMO pattern"
- "Early buyers (first 10%) control 60% of volume but only 20% have sold - this is either strong conviction or insider knowledge"
- "Transaction velocity increased 5x in last hour but price only moved 2% - this is a 'bait trap' trying to manipulate trending lists"

**YOUR CREATIVITY HAS NO LIMITS** - extract every possible insight, calculate every meaningful metric, make every valid prediction. Surprise us with findings that reveal the TRUE story behind this token. Be bold, be creative, be thorough!

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

${advancedMetricsSection}

---

## 📈 TRANSACTION ANALYSIS (Last ${totalTransactions} Transactions)

**Time Range:** ${timeRangeText} (${timeRangeDays.toFixed(1)} days)

### Transaction Count Distribution:
- **Buy Transactions:** ${transactions.buyCount} (${buyRatio.toFixed(1)}%)
- **Sell Transactions:** ${transactions.sellCount} (${sellRatio.toFixed(1)}%)

### Transaction Volume Distribution (USD):
- **Buy Volume:** $${buyVolumeUSD.toLocaleString()} (${buyVolumeRatio.toFixed(1)}% of total volume)
- **Sell Volume:** $${sellVolumeUSD.toLocaleString()} (${(100 - buyVolumeRatio).toFixed(1)}% of total volume)
- **Average Transaction Size:** $${avgTransactionSize.toFixed(2)}

**🔍 CRITICAL ANALYSIS REQUIRED:**
- If buy COUNT is high but buy VOLUME is low → Small retail traders (could be FOMO or bots)
- If buy COUNT is low but buy VOLUME is high → Whale accumulation (could be bullish or manipulation)
- If both are high → Strong organic interest
- If both are low → Low activity, high risk

**Top 5 Active Wallets (by total volume):**
${topWalletsText}
${walletProfilesSection}

**🔍 HIGH-VALUE BUYERS (Wallets with large buy transactions - 5x+ average):**
${highValueBuyersText}

**🔍 HIGH-VALUE SELLERS (Wallets with large sell transactions - 5x+ average):**
${highValueSellersText}

**📊 Large Transaction Analysis:**
- Large buy transactions represent ${transactions.largeBuyRatio?.toFixed(1) || 0}% of total volume
- Large sell transactions represent ${transactions.largeSellRatio?.toFixed(1) || 0}% of total volume
- **Key Insight:** If large buys > large sells = whale accumulation (bullish). If large sells > large buys = whale exit (bearish).

**Wallet Concentration:**
- Top wallet controls: **${topWalletShare.toFixed(1)}%** of transaction volume
- Risk threshold: >30% concentration = High manipulation risk
- **Wallet Diversity:** ${uniqueWallets} unique wallets, ${avgTradesPerWallet.toFixed(1)} avg trades/wallet

---

## 🚨 SECURITY ALERTS

**Token Authority Status:**
${freezeAuthorityWarning}
${mintAuthorityWarning}

**Detected Patterns:**
${suspiciousPatternsText}

**🔬 ADVANCED FORENSIC PATTERNS DETECTED:**
The system has performed deep forensic analysis and detected the following advanced patterns:

1. **MAFYA KÜMESİ (Cluster Analysis):** Synchronized wallet activity - multiple wallets trading in the same second indicates coordinated bot activity
2. **KÂR BASINCI (Profit Pressure):** Calculated holder cost basis to determine profit/loss pressure - shows when holders might take profits
3. **YEMLEME & TUZAK (Bait Watch):** High transaction count but no price movement - micro-transactions trying to manipulate trending lists
4. **DIAMOND HANDS & SMART MONEY:** Early buyers who haven't sold - shows long-term conviction
5. **FOMO vs. PANIK (Velocity Sentiment):** Transaction velocity acceleration - detects panic selling or FOMO buying
6. **TAZE KAN GİRİŞİ (New Wallet Flow):** Unique new wallets entering - shows if token is going viral or stuck in closed loop

**IMPORTANT:** These patterns are calculated from actual transaction data. Use them to provide deep insights that go beyond surface-level observations.

---

## 📋 HOW TO WRITE THE REPORT

**CRITICAL: You must provide BALANCED analysis - not just risks, but also opportunities and normal behaviors for memecoins!**

Write your report in this exact format:

### 1. RISK SCORE (Required - First Line)
Give a number from 0-100:
- **0-20:** Very Safe (You can probably trust this)
- **21-40:** Mostly Safe (Small concerns, but probably okay)
- **41-60:** Be Careful (Some warning signs, but could be normal for memecoins)
- **61-80:** Dangerous (Lots of red flags)
- **81-100:** Very Dangerous (Strong scam/rug pull signs)

**Format:** Risk Score: [NUMBER]

**IMPORTANT:** For new memecoins, many "suspicious" patterns are NORMAL:
- Low transaction sizes ($5-50) = normal retail activity
- Many new wallets = could be viral growth, not just bots
- High sell ratio = normal profit-taking after pump
- Don't automatically mark everything as "dangerous" - analyze context!

### 2. QUICK SUMMARY (2-3 sentences)
Give a BALANCED overview: What are the main risks AND opportunities? Is this token safe? What's the biggest concern AND what's positive?

### 3. WHAT YOU NEED TO KNOW

Write this section in simple language. Explain each point like you're talking to someone who's new to crypto:

#### 💰 Is There Enough Money in the Pool?
- **Calculate liquidity-to-market-cap ratio** (provided in Advanced Metrics)
- For memecoins: 20-30% liquidity ratio is HEALTHY, not "low"
- Below 10% = risky, above 50% = unusual
- Can you easily buy/sell without losing money on price changes?
- Explain: "There's $X in the pool with estimated $Y market cap, which is a ${liquidityToMarketCapRatio.toFixed(1)}% ratio. This means..."

#### 🔒 Is This Token Safe?
- Can the creators freeze your tokens? (Bad sign!)
- Can they print more tokens? (Very bad sign!)
- Is this a scam waiting to happen?
- Use simple language: "The creators can/cannot do X, which means..."

#### 📊 What's Happening with Trading?
- **ANALYZE BOTH COUNT AND VOLUME - THEY TELL DIFFERENT STORIES:**
  - Transaction count: ${buyRatio.toFixed(1)}% buys vs ${sellRatio.toFixed(1)}% sells
  - USD volume: ${buyVolumeRatio.toFixed(1)}% buy volume vs ${(100 - buyVolumeRatio).toFixed(1)}% sell volume
- **CRITICAL:** Do these ratios match? If not, explain WHY:
  - More buy COUNT but less buy VOLUME = small retail traders (NORMAL for memecoins, could be FOMO or organic growth)
  - Less buy COUNT but more buy VOLUME = whale accumulation (could be bullish OR manipulation - analyze further)
  - Both high = Strong organic interest
  - Both low = Low activity, high risk
- **Average transaction size: $${avgTransactionSize.toFixed(2)}** - For memecoins, $5-50 is NORMAL retail activity. Don't call it "suspicious" without context!
- **High-value buyers analysis:** Look at the HIGH-VALUE BUYERS section above. Which wallets made large buys? Did they sell after (profit-taking) or are they holding (conviction)? Mention specific wallet addresses and their behavior.
- **High-value sellers analysis:** Look at the HIGH-VALUE SELLERS section above. Which wallets made large sells? Did they re-enter (accumulation strategy) or exit completely (bearish)? Mention specific wallet addresses.

#### 🚨 Are People Cheating? (BALANCED ANALYSIS REQUIRED)

**⚠️ RISK PATTERNS (Report these, but also explain if they're normal for memecoins):**
- **MAFYA KÜMESİ (Cluster Analysis):** Are multiple wallets trading in the same second? This indicates coordinated bot activity. Check the detected patterns above.
- **YEMLEME & TUZAK (Bait Watch):** Are there many transactions but no price movement? This suggests micro-transactions trying to manipulate trending lists. Check detected patterns.
- **TAZE KAN GİRİŞİ (New Wallet Flow):** ${newWalletRatio.toFixed(1)}% are new wallets. **CRITICAL:** Analyze if they're:
  - Real new investors (GOOD sign - growing community, going viral) - Look for varied transaction sizes, different times
  - Bot farm (BAD sign - fake activity) - Look for identical transaction sizes, same timing patterns
- **FOMO vs. PANIK (Velocity Sentiment):** Is transaction velocity spiking while price moves opposite direction? This indicates panic selling or FOMO buying. Check detected patterns.

**✅ POSITIVE PATTERNS (ALWAYS report these if present):**
- **DIAMOND HANDS:** Are early buyers still holding? This shows long-term conviction. Check detected patterns.
- **WHALE ACCUMULATION:** Are high-value buyers holding (not selling after buy)? This is BULLISH.
- **RE-ENTRY PATTERNS:** Are high-value sellers re-entering (buying after sell)? This shows accumulation strategy, not exit.
- **ORGANIC GROWTH:** Are new wallets showing varied transaction patterns (different sizes, times)? This suggests real investors, not bots.
- **BALANCED TRADING:** Are buy/sell ratios reasonable (not extreme)? This shows healthy market.

**🔍 WALLET-SPECIFIC ANALYSIS (REQUIRED):**
- **Mention specific wallet addresses** from HIGH-VALUE BUYERS and HIGH-VALUE SELLERS sections
- For each significant wallet, explain: "Wallet [ADDRESS] made [X] large buys totaling $[Y]. They [HOLDING/SOLD after buy]. This suggests [conviction/profit-taking/accumulation]."
- **Identify suspicious wallets:** "Wallet [ADDRESS] shows bot-like behavior: [specific pattern]. This wallet should be monitored."
- **Identify bullish wallets:** "Wallet [ADDRESS] is accumulating: [specific pattern]. This is a positive signal."

### 4. 🎯 KEY INSIGHTS (The Most Important Things)

**BALANCE IS CRITICAL:** List 10-15 findings, mixing risks AND opportunities. Don't just report risks!

**Examples of BALANCED insights:**
- **POSITIVE:** "✅ DIAMOND HANDS: Erken giren Alpha cüzdanların 70%'i hala içeride - projeye inanç tam"
- **POSITIVE:** "🔄 RE-ENTRY: Yüksek değerli satış yapan 3 cüzdan tekrar alım yaptı - accumulation stratejisi"
- **POSITIVE:** "🆕 TAZE KAN: Son alıcıların 85%'i yeni cüzdanlar - proje virale gidiyor (organik büyüme)"
- **POSITIVE:** "🐋 WHALE ACCUMULATION: Wallet [ADDRESS] $50K+ alım yaptı ve hala tutuyor - bullish signal"
- **NEUTRAL/INFO:** "💡 INTERESTING: 80% buy count ama 60% buy volume = küçük retail trader'lar (memecoin için normal)"
- **RISK:** "⚠️ MAFYA KÜMESİ: 8 cüzdan aynı saniyede senkronize hareket ediyor - koordineli bot aktivitesi"
- **RISK:** "🚨 PANIK SATIŞI: İşlem hızı 5x arttı + Fiyat düştü = Şelale düşüşü başlıyor"
- **RISK:** "⚠️ SUSPICIOUS WALLET: Wallet [ADDRESS] yüksek değerli satış yaptı ve çıktı - takip edilmeli"

**REQUIRED:** Include at least 3-5 wallet-specific insights with addresses!

### 5. ⚠️ WARNINGS (If There Are Any)

If there are serious problems, list them clearly:
- "DO NOT invest more than you can afford to lose"
- "This pool has very little money - you might lose 20%+ on every trade"
- "We detected fake trading activity - the price might be manipulated"
- "Wallet [ADDRESS] shows suspicious behavior - monitor this wallet"

### 6. 💡 WHAT SHOULD YOU DO?

Give clear, BALANCED advice:
- Should people trade this token? (Yes/No/Maybe, and why - consider both risks AND opportunities)
- What are the POSITIVE signals to watch for?
- What are the RISK signals to watch for?
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

