const { Pool } = require('pg');

async function clearIPBlocks() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Clearing IP blocks from database...');

    // Очистка блокировок
    const result = await pool.query('DELETE FROM ip_blacklist RETURNING *');
    console.log(`✅ Cleared ${result.rowCount} IP blocks`);

    // Проверка
    const check = await pool.query('SELECT COUNT(*) as count FROM ip_blacklist');
    console.log(`📊 Remaining blocks: ${check.rows[0].count}`);

    console.log('\n🎉 IP blocks cleared successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

clearIPBlocks();
