const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  });

  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    console.log('🔄 Running Ultimate Security migration...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'src/database/migrations/002_add_ultimate_security.sql'),
      'utf8'
    );

    await pool.query(migrationSQL);
    console.log('✅ Ultimate Security migration completed successfully!');

    // Проверка созданных таблиц
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'user_2fa_settings',
        'intrusion_attempts',
        'ip_blacklist',
        'vulnerability_scans',
        'user_behavior_profiles',
        'anomaly_detections',
        'security_incidents',
        'waf_blocks',
        'secret_rotations',
        'rate_limit_violations',
        'geo_blocks',
        'security_alerts'
      )
      ORDER BY table_name
    `);

    console.log('\n📊 Created security tables:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log('\n🎉 Ultimate Security Edition is ready!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
