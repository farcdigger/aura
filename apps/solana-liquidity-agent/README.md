# 🌊 Solana Liquidity Analysis Agent

AI-powered Solana liquidity pool analysis agent using Anthropic Claude, Helius API, and BullMQ queue system.

## 🎯 Features

- **Deep Pool Analysis**: Analyzes Raydium liquidity pools for risk, manipulation, and health
- **High Concurrency**: Handles 50+ concurrent requests using Queue-Worker architecture
- **AI-Powered**: Uses Anthropic Claude (via Daydreams Inference API) for intelligent analysis
- **Blockchain Data**: Fetches real-time data from Helius API (DAS + RPC)
- **Smart Caching**: Redis-based caching to reduce API calls and costs
- **Persistent Storage**: Stores analysis results in Supabase PostgreSQL
- **Scalable**: Separate API server and Worker processes for horizontal scaling

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────┐      ┌─────────────┐
│   Client    │──────│   API    │──────│    Redis    │
│  (Browser)  │      │  Server  │      │   (Queue)   │
└─────────────┘      └──────────┘      └─────────────┘
                                               │
                                               │
                                        ┌──────▼──────┐
                                        │   Worker    │
                                        │  (BullMQ)   │
                                        └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
             ┌──────▼──────┐         ┌────────▼────────┐       ┌─────────▼────────┐
             │   Helius    │         │  Anthropic AI   │       │    Supabase      │
             │  (Solana)   │         │    (Claude)     │       │  (PostgreSQL)    │
             └─────────────┘         └─────────────────┘       └──────────────────┘
```

## 📦 Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **API Framework**: Hono
- **Queue System**: BullMQ + Redis (Upstash)
- **AI Model**: Anthropic Claude (via Daydreams)
- **Blockchain Data**: Helius SDK
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis (ioredis)

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) installed
- Helius API key ([Get here](https://helius.dev))
- Daydreams Inference API key ([Get here](https://daydreams.so))
- Supabase project ([Create here](https://supabase.com))
- Upstash Redis database ([Create here](https://upstash.com))

### 1. Install Dependencies

```bash
cd apps/solana-liquidity-agent
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp env.example .env
```

Required variables:
- `HELIUS_API_KEY`: Your Helius API key
- `INFERENCE_API_KEY`: Daydreams Inference API key
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `REDIS_URL`: Upstash Redis connection string

### 3. Set Up Database

Run the Supabase schema:

```bash
# Copy the SQL from scripts/setup-supabase-schema.sql
# Run it in your Supabase SQL Editor
```

### 4. Test Connections

```bash
# Test Redis
bun run test:redis

# Test Helius API
bun run test:helius

# Type check
bun run type-check
```

### 5. Start Services

**Terminal 1 - Worker Process:**
```bash
bun run worker
```

**Terminal 2 - API Server:**
```bash
bun run dev
```

### 6. Run Full Test

**Terminal 3 - Test:**
```bash
bun run test:full
```

## 📡 API Endpoints

### POST `/analyze`

Submit a new pool analysis job.

**Request:**
```json
{
  "poolId": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
  "userId": "user-123",
  "options": {
    "transactionLimit": 1000,
    "skipCache": false
  }
}
```

**Response:**
```json
{
  "status": "queued",
  "jobId": "job-xyz-123",
  "poolId": "58oQChx...",
  "message": "Analysis job queued successfully",
  "estimatedTime": "30-60 seconds"
}
```

### GET `/status/:jobId`

Check job status.

**Response:**
```json
{
  "jobId": "job-xyz-123",
  "state": "completed",
  "progress": 100,
  "result": {
    "poolId": "58oQChx...",
    "riskScore": 35,
    "analysisResult": { ... }
  }
}
```

### GET `/analysis/:poolId`

Get cached or recent analysis.

**Response:**
```json
{
  "source": "cache",
  "poolId": "58oQChx...",
  "result": {
    "riskScore": 35,
    "summary": "...",
    "details": { ... }
  }
}
```

### GET `/health`

System health check.

**Response:**
```json
{
  "server": "ok",
  "redis": "ok",
  "supabase": "ok",
  "helius": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET `/stats`

Queue statistics (for monitoring).

## 🧪 Testing

```bash
# Test individual components
bun run test:redis      # Redis connection
bun run test:helius     # Helius API
bun run type-check      # TypeScript

# Test full flow (requires Worker running)
bun run test:full
```

## 🔧 Configuration

### Worker Concurrency

Control how many jobs process simultaneously:

```bash
# .env
WORKER_CONCURRENCY=5  # Process 5 jobs at once
```

### Transaction Limit

Default number of transactions to fetch per analysis:

```bash
# .env
TRANSACTION_LIMIT=1000  # Fetch 1000 transactions
```

### Cache TTL

How long to cache analysis results:

```bash
# .env
CACHE_TTL_SECONDS=300  # 5 minutes
```

### AI Model

Choose Claude model:

```bash
# .env
REPORT_MODEL=claude-3-5-sonnet-20241022
MAX_COMPLETION_TOKENS=4096
```

## 📊 Development vs Production

### Development (Current Setup)

- ✅ Redis: Upstash (already production-ready!)
- ✅ Supabase: Cloud instance
- ✅ Local execution via `bun run`

### Production Deployment

**API Server → Vercel:**
```bash
vercel --prod
```

**Worker → Railway:**
```bash
railway up
```

See `PRODUCTION_CHECKLIST.md` for detailed deployment guide.

## 🐛 Troubleshooting

### Worker not processing jobs

1. Check if Worker is running: `bun run worker`
2. Check Redis connection: `bun run test:redis`
3. Check logs in Worker terminal

### API returns 503

1. Check health endpoint: `curl http://localhost:3000/health`
2. Verify all environment variables are set
3. Check Helius API quota: https://dashboard.helius.dev

### Analysis fails with "Rate limit exceeded"

1. Reduce `WORKER_CONCURRENCY` (e.g., from 5 to 3)
2. Increase `TRANSACTION_LIMIT` gradually (don't jump to 10000)
3. Upgrade Helius plan if needed

## 📝 Important Notes

### Placeholder Code

Some parts use mock data for MVP:

1. **Raydium Pool Parsing** (`helius-client.ts`):
   - Currently uses placeholder reserves
   - Real implementation requires Raydium SDK or Borsh deserialization

2. **Transaction Analysis** (`helius-client.ts`):
   - Buy/sell detection uses heuristics
   - Needs Raydium instruction parsing for accuracy

3. **Volume Calculation**:
   - USD values are estimates
   - Integrate Jupiter API for real prices

See `PRODUCTION_CHECKLIST.md` for full list.

## 📚 Project Structure

```
apps/solana-liquidity-agent/
├── src/
│   ├── index.ts              # API Server (Hono)
│   ├── worker.ts             # BullMQ Worker
│   └── lib/
│       ├── types.ts          # TypeScript types
│       ├── helius-client.ts  # Helius API wrapper
│       ├── claude-prompt.ts  # AI prompt builder
│       ├── supabase.ts       # Database client
│       ├── cache.ts          # Redis cache
│       └── queue.ts          # BullMQ queue
├── scripts/
│   ├── test-redis.ts         # Redis test
│   ├── test-helius.ts        # Helius test
│   ├── test-full-flow.ts     # End-to-end test
│   └── setup-supabase-schema.sql  # DB schema
├── package.json
├── tsconfig.json
├── .env
├── env.example
├── README.md
└── PRODUCTION_CHECKLIST.md
```

## 🤝 Contributing

This is a monorepo project. Make sure to:

1. Work in isolated `apps/solana-liquidity-agent/` directory
2. Don't affect other apps (`yama-agent`, `web`, etc.)
3. Test thoroughly before committing

## 📄 License

Part of the `xfroraproje` monorepo.

## 🔗 Links

- [Helius Docs](https://docs.helius.dev)
- [Daydreams Docs](https://docs.daydreams.so)
- [BullMQ Docs](https://docs.bullmq.io)
- [Supabase Docs](https://supabase.com/docs)
- [Anthropic Claude](https://www.anthropic.com/claude)

---

**Built with ❤️ for the Solana ecosystem**
