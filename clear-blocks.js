const { Pool } = require('pg');
const Redis = require('ioredis');

async function clearBlocks() {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  
  if (!databaseUrl || !redisUrl) {
    console.error('❌ DATABASE_URL or REDIS_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const redis = new Redis(redisUrl);

  try {
    console.log('🔄 Clearing IP blocks...');

    // Очистка блокировок в базе данных
    await pool.query('DELETE FROM ip_blacklist');
    console.log('✅ Cleared ip_blacklist table');

    // Очистка DDoS счетчиков в Redis
    const ddosKeys = await redis.keys('ddos:*');
    if (ddosKeys.length > 0) {
      await redis.del(...ddosKeys);
      console.log(`✅ Cleared ${ddosKeys.length} DDoS keys from Redis`);
    }

    // Очистка rate limit счетчиков
    const rateLimitKeys = await redis.keys('rate_limit:*');
    if (rateLimitKeys.length > 0) {
      await redis.del(...rateLimitKeys);
      console.log(`✅ Cleared ${rateLimitKeys.length} rate limit keys from Redis`);
    }

    // Очистка блокировок
    const blockKeys = await redis.keys('blocked:*');
    if (blockKeys.length > 0) {
      await redis.del(...blockKeys);
      console.log(`✅ Cleared ${blockKeys.length} block keys from Redis`);
    }

    console.log('\n🎉 All blocks cleared successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

clearBlocks();
