# The Graph Integration Guide

Complete guide for using The Graph blockchain data analytics with yama-agent.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup](#setup)
4. [Available Entrypoints](#available-entrypoints)
5. [Usage Examples](#usage-examples)
6. [Feature Engineering](#feature-engineering)
7. [Caching Strategy](#caching-strategy)
8. [Scheduled Jobs](#scheduled-jobs)
9. [Python Analytics Integration](#python-analytics-integration)
10. [Production Deployment](#production-deployment)

## Overview

This integration provides:
- **The Graph Subgraph Queries**: Pre-configured access to DeFi and NFT protocols
- **Feature Engineering**: Advanced analytics beyond raw blockchain data
- **Caching Layer**: Redis-powered query optimization
- **Job Scheduling**: Automated data collection and analysis
- **Python ML Pipeline**: Feature extraction and anomaly detection

## Architecture

```
┌─────────────────┐
│   The Graph     │
│   Subgraphs     │
└────────┬────────┘
         │
         v
┌─────────────────┐      ┌─────────────────┐
│   yama-agent    │◄────►│  Redis Cache    │
│  (TypeScript)   │      └─────────────────┘
└────────┬────────┘
         │
         v
┌─────────────────┐      ┌─────────────────┐
│  Python Analytics│◄────►│  PostgreSQL     │
│  (Feature Eng.)  │      │  (TimescaleDB)  │
└─────────────────┘      └─────────────────┘
```

## Setup

### 1. Install Dependencies

```bash
cd apps/yama-agent
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# The Graph API Key (required)
THE_GRAPH_API_KEY=your_api_key_from_thegraph_studio

# Redis (optional but recommended)
REDIS_URL=redis://localhost:6379

# Python Analytics
PYTHON_ANALYTICS_URL=http://localhost:8000
```

### 3. Start Services

**Option A: Docker Compose (Recommended)**

```bash
docker-compose up -d
```

This starts:
- yama-agent (port 3001)
- Python analytics (port 8000)
- Redis (port 6379)
- PostgreSQL with TimescaleDB (port 5432)

**Option B: Manual**

```bash
# Terminal 1: Start agent
cd apps/yama-agent
bun run dev

# Terminal 2: Start Python analytics
cd services/python-analytics
pip install -r requirements.txt
python main.py

# Terminal 3: Start Redis
redis-server
```

## Available Entrypoints

### 1. Analyze Top Pools

**Endpoint**: `analyze-top-pools`

Analyzes DeFi pools with liquidity efficiency metrics.

**Input Schema**:
```typescript
{
  network: "ethereum" | "arbitrum",  // default: "ethereum"
  limit: number                       // 1-100, default: 20
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3001/entrypoints/analyze-top-pools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "limit": 10
    }
  }'
```

**Response**:
```json
{
  "output": {
    "pools": [
      {
        "id": "0x...",
        "token0": { "symbol": "WETH", "name": "Wrapped Ether" },
        "token1": { "symbol": "USDC", "name": "USD Coin" },
        "metrics": {
          "tvlUSD": 150000000,
          "volumeUSD": 50000000,
          "liquidityEfficiency": 33.33,
          "activityScore": 85
        }
      }
    ],
    "insights": {
      "totalTVL": 1500000000,
      "totalVolume": 500000000,
      "mostEfficient": [
        { "pool": "WETH/USDC", "efficiency": 45.2 }
      ]
    }
  }
}
```

### 2. Analyze Pool Activity

**Endpoint**: `analyze-pool-activity`

Analyzes specific pool with anomaly detection.

**Input Schema**:
```typescript
{
  poolId: string,                    // Pool contract address
  network: "ethereum" | "arbitrum",  // default: "ethereum"
  hoursBack: number                  // 1-168 (7 days), default: 24
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3001/entrypoints/analyze-pool-activity/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "poolId": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      "network": "ethereum",
      "hoursBack": 24
    }
  }'
```

**Response**:
```json
{
  "output": {
    "poolId": "0x88e6...",
    "timeframe": "24 hours",
    "swapCount": 1234,
    "metrics": {
      "totalVolumeUSD": 45000000,
      "averageSwapSizeUSD": 36500,
      "whaleSwaps": 23,
      "whaleVolumeUSD": 15000000
    },
    "anomalyDetection": {
      "hasAnomaly": true,
      "anomalyScore": 75,
      "description": "Volume spike detected (>5x average). "
    },
    "actionableInsight": "⚠️ ALERT: Unusual activity detected. Volume spike detected (>5x average)."
  }
}
```

### 3. Track Whale Activity

**Endpoint**: `track-whale-activity`

Tracks large wallet positions (Smart Money Tracker).

**Input Schema**:
```typescript
{
  network: "ethereum" | "arbitrum",  // default: "ethereum"
  minValueUSD: number                // minimum: 10000, default: 100000
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3001/entrypoints/track-whale-activity/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "minValueUSD": 500000
    }
  }'
```

**Response**:
```json
{
  "output": {
    "totalWhalePositions": 156,
    "totalValueUSD": 450000000,
    "topPoolsByWhaleActivity": [
      {
        "pool": "WETH/USDC",
        "whaleCount": 45,
        "totalValue": 120000000
      }
    ],
    "actionableInsight": "🐋 Smart money is concentrated in WETH/USDC with 45 large positions."
  }
}
```

### 4. Analyze Lending Health

**Endpoint**: `analyze-lending-health`

Analyzes Aave protocol health with stress index.

**Input Schema**:
```typescript
{
  network: "ethereum",    // only ethereum supported
  hoursBack: number       // 1-168 (7 days), default: 24
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3001/entrypoints/analyze-lending-health/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "hoursBack": 48
    }
  }'
```

**Response**:
```json
{
  "output": {
    "protocolHealth": {
      "stressIndex": 35,
      "status": "Moderate Risk"
    },
    "metrics": {
      "totalLiquidity": 8500000000,
      "averageUtilization": "65.5%",
      "liquidationCount": 12
    },
    "highRiskAssets": [
      { "asset": "USDT", "utilizationRate": "85.3%" }
    ],
    "actionableInsight": "⚡ MODERATE RISK: Monitor 1 high-utilization assets closely."
  }
}
```

## Feature Engineering

### Proprietary Metrics Explained

#### 1. Liquidity Efficiency Score
```typescript
efficiency = (daily_volume / TVL) * 100
```
- **High score (>50)**: Capital is actively traded (good for LPs)
- **Low score (<10)**: Dead liquidity, poor capital efficiency

#### 2. Protocol Stress Index (PSI)
```typescript
PSI = 0.3 * (withdraw_velocity / deposit_velocity) * 100
    + 0.3 * (liquidation_count / 10) * 100
    + 0.4 * utilization_rate * 100
```
- **0-30**: Healthy
- **30-60**: Moderate risk
- **60-100**: High risk (potential bank run)

#### 3. Whale Activity Score
```typescript
score = (volume_score * 0.4) + (unique_whales * 0.3) + (frequency * 0.3)
```
- **0-30**: Low activity
- **30-70**: Moderate
- **70-100**: High whale concentration (smart money moving)

#### 4. Anomaly Score
Uses Isolation Forest ML algorithm:
- Detects volume spikes (>5x average)
- High frequency trading patterns
- Unusual wallet behaviors

## Caching Strategy

### Automatic Caching

All subgraph queries are automatically cached with intelligent TTLs:

```typescript
// Pool data: 5 minutes
cache.set('pools', data, 300);

// Whale positions: 15 minutes
cache.set('whales', data, 900);

// Protocol stats: 30 minutes
cache.set('protocol-stats', data, 1800);
```

### Manual Cache Control

```typescript
import { getCacheManager } from './lib/cache';

const cache = getCacheManager();

// Get cached data
const data = await cache.get('my-key');

// Set with custom TTL (1 hour)
await cache.set('my-key', myData, 3600);

// Clear specific key
await cache.del('my-key');
```

### Cache Keys

```typescript
// Subgraph query cache key
const key = CacheManager.subgraphKey(
  'UNISWAP_V3_ETHEREUM',
  'TOP_POOLS',
  { limit: 20 }
);

// Feature cache key
const featureKey = CacheManager.featureKey(
  'whale-activity',
  { network: 'ethereum' }
);
```

## Scheduled Jobs

### Pre-configured Jobs

```typescript
// In src/index.ts
import { setupAnalyticsSchedule } from './lib/scheduler';

// Enable scheduled jobs
if (process.env.ENABLE_ANALYTICS_JOBS === 'true') {
  setupAnalyticsSchedule();
}
```

Default schedule:
- **Daily whale report**: 9:00 AM UTC
- **Pool analytics update**: Every hour
- **Anomaly detection**: Every 5 minutes
- **Lending health check**: Every 30 minutes

### Custom Jobs

```typescript
import { getScheduler } from './lib/scheduler';

const scheduler = getScheduler();

// Cron job
scheduler.scheduleCronJob(
  'my-custom-job',
  '*/10 * * * *',  // Every 10 minutes
  async () => {
    // Your custom logic
  }
);

// Queue-based job
await scheduler.addJob('analytics-queue', {
  type: 'pool-analysis',
  params: { poolId: '0x...' },
  timestamp: Date.now()
});
```

## Python Analytics Integration

### Calling Python Features from Agent

```typescript
// In your entrypoint handler
const response = await fetch(
  `${process.env.PYTHON_ANALYTICS_URL}/api/v1/features/whale-activity-score`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      positions: whalePositions,
      timeframe_hours: 24
    })
  }
);

const analysis = await response.json();
```

### Available Python Endpoints

See [Python Analytics README](../../services/python-analytics/README.md) for full API documentation.

Key endpoints:
- `/api/v1/features/loyalty-metrics`
- `/api/v1/features/whale-activity-score`
- `/api/v1/features/smart-money-momentum`
- `/api/v1/features/liquidity-flow`
- `/api/v1/features/detect-anomalies`

## Production Deployment

### Environment Variables

```bash
# Production values
NODE_ENV=production
ENABLE_CACHE=true
ENABLE_SCHEDULER=true
ENABLE_ANALYTICS_JOBS=true
LOG_LEVEL=warn

# The Graph (use production API key)
THE_GRAPH_API_KEY=your_production_key

# Redis (managed service recommended)
REDIS_URL=redis://production-redis:6379

# Database (use managed TimescaleDB)
DATABASE_URL=postgresql://...

# Monitoring
SENTRY_DSN=https://...
```

### Docker Deployment

```bash
# Build
docker-compose build

# Deploy
docker-compose up -d

# View logs
docker-compose logs -f yama-agent

# Scale workers
docker-compose up -d --scale yama-agent=3
```

### Performance Tuning

1. **Redis**: Use Redis Cluster for high availability
2. **Database**: Enable TimescaleDB compression for time-series data
3. **Caching**: Increase TTLs for less volatile data
4. **Workers**: Scale BullMQ workers based on job queue size

### Monitoring

```bash
# Health check
curl http://localhost:3001/health

# Metrics (if enabled)
curl http://localhost:3001/metrics

# Queue stats
curl http://localhost:3001/queue-stats
```

## Troubleshooting

### The Graph API Rate Limits

```typescript
// Symptoms: 429 errors, slow responses
// Solution: Use caching and reduce query frequency

// Check current rate limit
const response = await fetch(subgraphUrl, {
  method: 'POST',
  body: JSON.stringify({ query })
});

console.log('Rate limit:', response.headers.get('X-RateLimit-Remaining'));
```

### Cache Connection Issues

```typescript
// Symptoms: [Cache] Redis error
// Solution: Check Redis connection

// Test connection
const cache = getCacheManager();
const isConnected = await cache.exists('test-key');
console.log('Redis connected:', isConnected);
```

### Job Scheduler Not Working

```bash
# Check if Redis is running
redis-cli ping

# Check BullMQ dashboard (optional)
npm install -g bull-board
bull-board
```

## Next Steps

1. **Add Custom Subgraphs**: Edit `src/lib/graphClient.ts`
2. **Create Custom Features**: Add to `src/lib/graph-entrypoints.ts`
3. **Implement ML Models**: Extend Python analytics
4. **Build Dashboard**: Use Next.js to visualize data
5. **Add Alerts**: Integrate with Telegram/Discord for real-time notifications

## Resources

- [The Graph Documentation](https://thegraph.com/docs/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
- [TimescaleDB Guide](https://docs.timescale.com/)





















































