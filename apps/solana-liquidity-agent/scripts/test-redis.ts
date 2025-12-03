import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('🔧 Testing Redis connection...');
console.log(`📍 URL: ${REDIS_URL.replace(/:[^:]*@/, ':***@')}`); // Hide password

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Upstash için TLS gerekli
  tls: {
    rejectUnauthorized: false, // Self-signed sertifikalara izin ver
  },
  family: 4, // IPv4 zorla
  connectTimeout: 10000,
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis!');
});

redis.on('ready', async () => {
  console.log('🎯 Redis is ready!');
  
  try {
    // Test 1: Ping
    const pong = await redis.ping();
    console.log(`\n📡 PING test: ${pong}`);
    
    // Test 2: Set/Get
    await redis.set('test-key', 'Hello Upstash!');
    const value = await redis.get('test-key');
    console.log(`💾 SET/GET test: ${value}`);
    
    // Test 3: Expiration
    await redis.setex('temp-key', 10, 'This expires in 10 seconds');
    const ttl = await redis.ttl('temp-key');
    console.log(`⏱️  TTL test: ${ttl} seconds remaining`);
    
    // Cleanup
    await redis.del('test-key', 'temp-key');
    
    console.log('\n✅ All tests passed! Redis is working perfectly.');
    console.log('🚀 Ready for Worker implementation (Adım 10)');
    
    await redis.quit();
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Redis test failed:', error.message);
    process.exit(1);
  }
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Connection timeout after 10 seconds');
  process.exit(1);
}, 10000);

