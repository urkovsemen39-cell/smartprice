import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Запускает SQL миграцию
 */
export async function runMigration(migrationFile: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log(`🔄 Running migration: ${migrationFile}`);
    
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log(`✅ Migration completed: ${migrationFile}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration failed: ${migrationFile}`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Запускает все миграции
 */
export async function runAllMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('📁 No migrations directory found');
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  if (files.length === 0) {
    console.log('📝 No migration files found');
    return;
  }
  
  console.log(`📦 Found ${files.length} migration(s)`);
  
  for (const file of files) {
    await runMigration(file);
  }
  
  console.log('✅ All migrations completed successfully');
}

// Если запускается напрямую
if (require.main === module) {
  runAllMigrations()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}
