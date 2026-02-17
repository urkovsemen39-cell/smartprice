import db from '../config/database';
import fs from 'fs';
import path from 'path';

export async function initializeDatabase() {
  try {
    console.log('🔍 Checking if database is initialized...');
    
    // Проверяем, существует ли таблица users
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    const tableExists = result.rows[0].exists;
    
    if (tableExists) {
      console.log('✅ Database already initialized');
      return;
    }
    
    console.log('📊 Initializing database schema...');
    
    // Читаем SQL файл
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    
    // Выполняем SQL
    await db.query(schemaSql);
    
    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}
