# Руководство по миграции базы данных

## Проблема
После деплоя Фазы 1 и Фазы 2 возникла ошибка:
```
error: column "email_verified" does not exist
```

Это происходит потому, что база данных уже существовала, и автоинициализация не обновила структуру таблицы `users`.

## Решение

### Вариант 1: Через Railway Dashboard (РЕКОМЕНДУЕТСЯ)

1. Открой Railway Dashboard: https://railway.app/
2. Выбери проект SmartPrice
3. Выбери PostgreSQL service
4. Перейди в вкладку "Data"
5. Нажми "Query" (или "Connect")
6. Скопируй содержимое файла `src/database/migrations/001_add_email_verification.sql`
7. Вставь в Query Editor и выполни

### Вариант 2: Через psql (если установлен)

1. Получи DATABASE_URL из Railway:
   - Railway Dashboard → PostgreSQL → Connect → Connection URL
   
2. Выполни миграцию:
   ```bash
   psql "postgresql://postgres:password@host:port/railway" -f backend/src/database/migrations/001_add_email_verification.sql
   ```

### Вариант 3: Через Node.js скрипт

1. Установи зависимости (если еще не установлены):
   ```bash
   cd backend
   npm install
   ```

2. Установи переменную окружения DATABASE_URL:
   ```bash
   # Windows CMD
   set DATABASE_URL=postgresql://postgres:password@host:port/railway
   
   # Windows PowerShell
   $env:DATABASE_URL="postgresql://postgres:password@host:port/railway"
   
   # Linux/Mac
   export DATABASE_URL="postgresql://postgres:password@host:port/railway"
   ```

3. Запусти миграцию:
   ```bash
   npm run db:migrate
   ```

### Вариант 4: Через Railway CLI (если работает)

```bash
railway run npm run db:migrate
```

## Что делает миграция

Миграция `001_add_email_verification.sql` выполняет следующие действия:

1. ✅ Добавляет колонки `email_verified` и `email_verified_at` в таблицу `users`
2. ✅ Создает таблицу `email_verifications`
3. ✅ Создает таблицу `user_sessions`
4. ✅ Создает таблицу `audit_log`
5. ✅ Создает таблицу `csp_violations`
6. ✅ Создает таблицу `api_keys`
7. ✅ Создает таблицу `api_key_usage`
8. ✅ Включает расширение `pg_stat_statements`
9. ✅ Создает все необходимые индексы

## Проверка после миграции

После выполнения миграции проверь:

1. **Health Check:**
   ```
   GET https://smartprice-backend-production.up.railway.app/health
   ```
   Должен вернуть `{"status":"ok"}`

2. **Регистрация:**
   ```
   POST https://smartprice-backend-production.up.railway.app/api/auth/register
   {
     "email": "test@example.com",
     "password": "password123",
     "name": "Test User"
   }
   ```
   Должна пройти успешно

3. **Вход:**
   ```
   POST https://smartprice-backend-production.up.railway.app/api/auth/login
   {
     "email": "test@example.com",
     "password": "password123"
   }
   ```
   Должен вернуть токен

## Безопасность

Миграция использует `IF NOT EXISTS` и `ADD COLUMN IF NOT EXISTS`, поэтому:
- ✅ Безопасно запускать несколько раз
- ✅ Не удалит существующие данные
- ✅ Не создаст дубликаты таблиц/колонок

## Откат (если нужно)

Если что-то пошло не так, можно откатить изменения:

```sql
-- Удалить новые таблицы
DROP TABLE IF EXISTS api_key_usage CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS csp_violations CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;

-- Удалить новые колонки из users
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
```

## Помощь

Если возникли проблемы:
1. Проверь логи Railway: Dashboard → Backend Service → Deployments → Logs
2. Проверь подключение к БД: `psql $DATABASE_URL -c "SELECT version();"`
3. Проверь существующие таблицы: `psql $DATABASE_URL -c "\dt"`
