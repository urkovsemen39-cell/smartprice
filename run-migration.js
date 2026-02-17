// Простой скрипт для запуска миграции
// Использование: node run-migration.js

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Получаем DATABASE_URL из переменных окружения или из Railway
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL не установлен!');
    console.log('\n📝 Установи DATABASE_URL из Railway:');
    console.log('1. Открой Railway Dashboard');
    console.log('2. PostgreSQL → Connect → Copy Connection URL');
    console.log('3. Выполни: set DATABASE_URL=<твой_url>  (Windows CMD)');
    console.log('   или: $env:DATABASE_URL="<твой_url>"  (Windows PowerShell)');
    console.log('4. Запусти снова: node run-migration.js');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Railway требует SSL
    }
  });

  try {
    console.log('🔄 Подключаемся к базе данных...');
    await client.connect();
    console.log('✅ Подключено!');

    console.log('🔄 Читаем файл миграции...');
    const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', '001_add_email_verification.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    console.log('✅ Файл прочитан!');

    console.log('🔄 Выполняем миграцию...');
    await client.query(sql);
    console.log('✅ Миграция выполнена успешно!');

    console.log('\n✅ Все готово! Теперь проверь:');
    console.log('   GET https://smartprice-backend-production.up.railway.app/health');

  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    console.error('\nПолная ошибка:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
