# 🚀 Quick Start Guide

Get up and running with The Graph analytics in 5 minutes.

## Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Docker and Docker Compose (optional but recommended)
- The Graph API key ([Get one here](https://thegraph.com/studio/))

## Option 1: Docker (Recommended)

### 1. Clone and Configure

```bash
cd apps/yama-agent
cp .env.example .env
```

Edit `.env` and add your API key:
```bash
THE_GRAPH_API_KEY=your_api_key_here
```

### 2. Start Everything

```bash
docker-compose up -d
```

This starts:
- ✅ Agent (http://localhost:3001)
- ✅ Python Analytics (http://localhost:8000)
- ✅ Redis
- ✅ PostgreSQL

### 3. Test It

```bash
# Health check
curl http://localhost:3001/health

# Analyze top DeFi pools
curl -X POST http://localhost:3001/entrypoints/analyze-top-pools/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"network": "ethereum", "limit": 5}}'
```

## Option 2: Local Development

### 1. Install Dependencies

```bash
cd apps/yama-agent
bun install

cd ../../services/python-analytics
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cd apps/yama-agent
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start Services

```bash
# Terminal 1: Agent
cd apps/yama-agent
bun run dev

# Terminal 2: Python Analytics
cd services/python-analytics
python main.py

# Terminal 3: Redis (optional)
redis-server
```

### 4. Test It

```bash
curl http://localhost:3001/health
```

## Your First Query

### 1. Get Top Pools

```bash
curl -X POST http://localhost:3001/entrypoints/analyze-top-pools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "limit": 10
    }
  }' | jq
```

### 2. Track Whale Activity

```bash
curl -X POST http://localhost:3001/entrypoints/track-whale-activity/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "minValueUSD": 100000
    }
  }' | jq
```

### 3. Detect Anomalies

```bash
curl -X POST http://localhost:3001/entrypoints/analyze-pool-activity/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "poolId": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      "network": "ethereum",
      "hoursBack": 24
    }
  }' | jq
```

### 4. Check Protocol Health

```bash
curl -X POST http://localhost:3001/entrypoints/analyze-lending-health/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "network": "ethereum",
      "hoursBack": 48
    }
  }' | jq
```

## Postman Collection

Import this collection to test all endpoints:

```json
{
  "info": {
    "name": "Yama Agent - The Graph Analytics",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Analyze Top Pools",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": "http://localhost:3001/entrypoints/analyze-top-pools/invoke",
        "body": {
          "mode": "raw",
          "raw": "{\"input\": {\"network\": \"ethereum\", \"limit\": 10}}"
        }
      }
    },
    {
      "name": "Track Whale Activity",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": "http://localhost:3001/entrypoints/track-whale-activity/invoke",
        "body": {
          "mode": "raw",
          "raw": "{\"input\": {\"network\": \"ethereum\", \"minValueUSD\": 100000}}"
        }
      }
    }
  ]
}
```

## Troubleshooting

### "The Graph API key not found"
- Make sure `THE_GRAPH_API_KEY` is set in `.env`
- Restart the agent after updating `.env`

### "Redis connection failed"
- If using Docker: Check `docker-compose logs redis`
- If local: Install and start Redis (`brew install redis` on Mac)

### "Port already in use"
- Change `YAMA_AGENT_PORT` in `.env`
- Or stop the conflicting service

## Next Steps

1. Read [THE_GRAPH_INTEGRATION.md](./THE_GRAPH_INTEGRATION.md) for detailed documentation
2. Explore custom features in `src/lib/graph-entrypoints.ts`
3. Add your own subgraphs in `src/lib/graphClient.ts`
4. Build a dashboard with Next.js to visualize the data

## Need Help?

- 📖 [Full Documentation](./THE_GRAPH_INTEGRATION.md)
- 🐛 [Report Issues](https://github.com/your-repo/issues)
- 💬 [Discord Community](#)

Happy analyzing! 🎉











































































