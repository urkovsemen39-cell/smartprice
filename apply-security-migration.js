const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Step 1: Rollback existing tables
    console.log('\n🔄 Step 1: Rolling back existing security tables...');
    const rollbackSQL = fs.readFileSync(
      path.join(__dirname, 'rollback-security.sql'),
      'utf8'
    );
    await pool.query(rollbackSQL);
    console.log('✅ Rollback completed');

    // Step 2: Apply new migration
    console.log('\n🔄 Step 2: Applying security migration...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'src/database/migrations/002_add_ultimate_security.sql'),
      'utf8'
    );
    await pool.query(migrationSQL);
    console.log('✅ Migration applied successfully');

    // Step 3: Verify tables
    console.log('\n🔄 Step 3: Verifying tables...');
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

    console.log('\n✅ Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    if (result.rows.length === 12) {
      console.log('\n🎉 All 12 security tables created successfully!');
    } else {
      console.log(`\n⚠️  Warning: Expected 12 tables, found ${result.rows.length}`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
