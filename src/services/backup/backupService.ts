/**
 * Backup Service
 * Полноценный бэкап всей системы
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream, createReadStream } from 'fs';
import archiver from 'archiver';
import { pool } from '../../config/database';
import redisClient from '../../config/redis';
import logger from '../../utils/logger';
import env from '../../config/env';

const execAsync = promisify(exec);

interface BackupResult {
  success: boolean;
  backupId: string;
  filename: string;
  size: number;
  timestamp: Date;
  components: {
    database: boolean;
    redis: boolean;
    files: boolean;
    config: boolean;
    logs: boolean;
  };
  error?: string;
}

interface BackupInfo {
  id: string;
  filename: string;
  size: number;
  created_at: Date;
  components: string[];
}

class BackupService {
  private readonly BACKUP_DIR = path.join(process.cwd(), 'backups');
  private readonly MAX_BACKUPS = 10; // Максимум хранимых бэкапов

  constructor() {
    // В облачных средах (Railway) файловая система read-only
    // Используем только instant backup без сохранения на диск
  }

  /**
   * Создание директории для бэкапов (не используется в production)
   */
  private async ensureBackupDir(): Promise<void> {
    // Отключено для облачных сред
    return;
  }

  /**
   * Генерация ID бэкапа
   */
  private generateBackupId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `backup-${timestamp}`;
  }

  /**
   * Создание полного бэкапа в памяти (для облачных сред)
   * Возвращает stream для немедленного скачивания
   */
  async createInstantBackup(): Promise<{ stream: NodeJS.ReadableStream; filename: string; size: number } | null> {
    const backupId = this.generateBackupId();
    const zipFilename = `${backupId}.zip`;

    try {
      logger.info('Starting instant backup...');

      // Создаем архив в памяти
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      // 1. Бэкап базы данных
      logger.info('Backing up database...');
      const dbData = await this.getDatabaseDump();
      if (dbData) {
        archive.append(dbData, { name: 'database.sql' });
      }

      // 2. Бэкап Redis
      logger.info('Backing up Redis...');
      const redisData = await this.getRedisData();
      if (redisData) {
        archive.append(JSON.stringify(redisData, null, 2), { name: 'redis-data.json' });
      }

      // 3. Бэкап конфигурации
      logger.info('Backing up config...');
      const configData = await this.getConfigData();
      archive.append(JSON.stringify(configData, null, 2), { name: 'config/environment.json' });

      // 4. Бэкап схемы БД
      const schemaData = await this.getDatabaseSchema();
      if (schemaData) {
        archive.append(schemaData, { name: 'database-schema.sql' });
      }

      // 5. Метаданные бэкапа
      const metadata = {
        backupId,
        timestamp: new Date().toISOString(),
        version: '2.0',
        components: ['database', 'redis', 'config', 'schema'],
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-metadata.json' });

      // Финализируем архив
      archive.finalize();

      logger.info('Instant backup created successfully');

      return {
        stream: archive,
        filename: zipFilename,
        size: 0, // Размер неизвестен до завершения
      };
    } catch (error: any) {
      logger.error('Instant backup failed:', error);
      return null;
    }
  }

  /**
   * Получение дампа базы данных как строка
   */
  private async getDatabaseDump(): Promise<string | null> {
    try {
      // Получаем все таблицы
      const tables = await pool.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);

      let dump = `-- SmartPrice Database Backup\n`;
      dump += `-- Generated: ${new Date().toISOString()}\n\n`;

      for (const { tablename } of tables.rows) {
        // Получаем данные таблицы
        const data = await pool.query(`SELECT * FROM ${tablename}`);
        
        if (data.rows.length > 0) {
          dump += `\n-- Table: ${tablename}\n`;
          dump += `TRUNCATE TABLE ${tablename} CASCADE;\n`;
          
          // Генерируем INSERT statements
          for (const row of data.rows) {
            const columns = Object.keys(row);
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return val;
            });
            
            dump += `INSERT INTO ${tablename} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }
      }

      return dump;
    } catch (error) {
      logger.error('Database dump failed:', error);
      return null;
    }
  }

  /**
   * Получение схемы базы данных
   */
  private async getDatabaseSchema(): Promise<string | null> {
    try {
      const schema = await pool.query(`
        SELECT 
          'CREATE TABLE ' || tablename || ' (' ||
          string_agg(column_name || ' ' || data_type, ', ') || ');' as create_statement
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY tablename
      `);

      return schema.rows.map(r => r.create_statement).join('\n\n');
    } catch (error) {
      logger.error('Schema dump failed:', error);
      return null;
    }
  }

  /**
   * Получение данных Redis
   */
  private async getRedisData(): Promise<Record<string, any> | null> {
    try {
      const keys = await redisClient.keys('*');
      const data: Record<string, any> = {};

      for (const key of keys) {
        const type = await redisClient.type(key);
        
        switch (type) {
          case 'string':
            data[key] = await redisClient.get(key);
            break;
          case 'hash':
            data[key] = await redisClient.hGetAll(key);
            break;
          case 'list':
            data[key] = await redisClient.lRange(key, 0, -1);
            break;
          case 'set':
            data[key] = await redisClient.sMembers(key);
            break;
          case 'zset':
            data[key] = await redisClient.zRange(key, 0, -1);
            break;
        }
      }

      return data;
    } catch (error) {
      logger.error('Redis data export failed:', error);
      return null;
    }
  }

  /**
   * Получение конфигурации (без секретов)
   */
  private async getConfigData(): Promise<any> {
    return {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      FRONTEND_URL: env.FRONTEND_URL,
      EMAIL_PROVIDER: env.EMAIL_PROVIDER,
      timestamp: new Date().toISOString(),
      // НЕ включаем секреты!
    };
  }

  /**
   * Создание полного бэкапа системы
   */
  async createFullBackup(userId: number): Promise<BackupResult> {
    const backupId = this.generateBackupId();
    const tempDir = path.join(this.BACKUP_DIR, backupId);
    const zipFilename = `${backupId}.zip`;
    const zipPath = path.join(this.BACKUP_DIR, zipFilename);

    const result: BackupResult = {
      success: false,
      backupId,
      filename: zipFilename,
      size: 0,
      timestamp: new Date(),
      components: {
        database: false,
        redis: false,
        files: false,
        config: false,
        logs: false,
      },
    };

    try {
      // Создание временной директории
      await fs.mkdir(tempDir, { recursive: true });

      // 1. Бэкап базы данных
      logger.info('Starting database backup...');
      result.components.database = await this.backupDatabase(tempDir);

      // 2. Бэкап Redis
      logger.info('Starting Redis backup...');
      result.components.redis = await this.backupRedis(tempDir);

      // 3. Бэкап файлов (если есть uploads)
      logger.info('Starting files backup...');
      result.components.files = await this.backupFiles(tempDir);

      // 4. Бэкап конфигурации
      logger.info('Starting config backup...');
      result.components.config = await this.backupConfig(tempDir);

      // 5. Бэкап логов
      logger.info('Starting logs backup...');
      result.components.logs = await this.backupLogs(tempDir);

      // Создание ZIP архива
      logger.info('Creating ZIP archive...');
      await this.createZipArchive(tempDir, zipPath);

      // Получение размера архива
      const stats = await fs.stat(zipPath);
      result.size = stats.size;

      // Удаление временной директории
      await fs.rm(tempDir, { recursive: true, force: true });

      // Сохранение информации о бэкапе в БД
      await this.saveBackupInfo(backupId, zipFilename, result.size, userId);

      // Очистка старых бэкапов
      await this.cleanupOldBackups();

      result.success = true;
      logger.info(`Backup completed successfully: ${backupId}`);

      return result;
    } catch (error: any) {
      logger.error('Backup failed:', error);
      result.error = error.message;

      // Очистка при ошибке
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.rm(zipPath, { force: true });
      } catch (cleanupError) {
        logger.error('Error cleaning up failed backup:', cleanupError);
      }

      return result;
    }
  }

  /**
   * Бэкап базы данных PostgreSQL
   */
  private async backupDatabase(targetDir: string): Promise<boolean> {
    try {
      const dumpFile = path.join(targetDir, 'database.sql');

      // Формирование команды pg_dump
      let command: string;

      if (env.DATABASE_URL) {
        // Используем DATABASE_URL
        command = `pg_dump "${env.DATABASE_URL}" > "${dumpFile}"`;
      } else {
        // Используем отдельные параметры
        const pgPassword = env.DB_PASSWORD ? `PGPASSWORD="${env.DB_PASSWORD}"` : '';
        command = `${pgPassword} pg_dump -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_USER} -d ${env.DB_NAME} > "${dumpFile}"`;
      }

      await execAsync(command);

      // Проверка что файл создан
      const stats = await fs.stat(dumpFile);
      return stats.size > 0;
    } catch (error) {
      logger.error('Database backup failed:', error);
      return false;
    }
  }

  /**
   * Бэкап Redis данных
   */
  private async backupRedis(targetDir: string): Promise<boolean> {
    try {
      const redisFile = path.join(targetDir, 'redis-data.json');

      // Получение всех ключей
      const keys = await redisClient.keys('*');
      const data: Record<string, any> = {};

      // Экспорт данных
      for (const key of keys) {
        const type = await redisClient.type(key);
        
        switch (type) {
          case 'string':
            data[key] = await redisClient.get(key);
            break;
          case 'hash':
            data[key] = await redisClient.hGetAll(key);
            break;
          case 'list':
            data[key] = await redisClient.lRange(key, 0, -1);
            break;
          case 'set':
            data[key] = await redisClient.sMembers(key);
            break;
          case 'zset':
            data[key] = await redisClient.zRange(key, 0, -1);
            break;
        }
      }

      await fs.writeFile(redisFile, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      logger.error('Redis backup failed:', error);
      return false;
    }
  }

  /**
   * Бэкап загруженных файлов
   */
  private async backupFiles(targetDir: string): Promise<boolean> {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const targetUploadsDir = path.join(targetDir, 'uploads');

      // Проверка существования директории uploads
      try {
        await fs.access(uploadsDir);
      } catch {
        // Директория не существует, пропускаем
        return true;
      }

      // Копирование файлов
      await this.copyDirectory(uploadsDir, targetUploadsDir);
      return true;
    } catch (error) {
      logger.error('Files backup failed:', error);
      return false;
    }
  }

  /**
   * Бэкап конфигурации
   */
  private async backupConfig(targetDir: string): Promise<boolean> {
    try {
      const configDir = path.join(targetDir, 'config');
      await fs.mkdir(configDir, { recursive: true });

      // Копирование .env.example (не .env для безопасности!)
      const envExample = path.join(process.cwd(), '.env.example');
      try {
        await fs.copyFile(envExample, path.join(configDir, '.env.example'));
      } catch {
        // Файл может не существовать
      }

      // Копирование package.json
      const packageJson = path.join(process.cwd(), 'package.json');
      await fs.copyFile(packageJson, path.join(configDir, 'package.json'));

      // Сохранение текущих переменных окружения (без секретов)
      const safeEnv = {
        NODE_ENV: env.NODE_ENV,
        PORT: env.PORT,
        FRONTEND_URL: env.FRONTEND_URL,
        EMAIL_PROVIDER: env.EMAIL_PROVIDER,
        // НЕ включаем секреты!
      };
      await fs.writeFile(
        path.join(configDir, 'environment.json'),
        JSON.stringify(safeEnv, null, 2)
      );

      return true;
    } catch (error) {
      logger.error('Config backup failed:', error);
      return false;
    }
  }

  /**
   * Бэкап логов
   */
  private async backupLogs(targetDir: string): Promise<boolean> {
    try {
      const logsDir = path.join(process.cwd(), 'logs');
      const targetLogsDir = path.join(targetDir, 'logs');

      // Проверка существования директории logs
      try {
        await fs.access(logsDir);
      } catch {
        // Директория не существует, пропускаем
        return true;
      }

      // Копирование только последних логов (не все)
      await fs.mkdir(targetLogsDir, { recursive: true });
      const files = await fs.readdir(logsDir);
      
      for (const file of files.slice(-10)) { // Последние 10 файлов
        await fs.copyFile(
          path.join(logsDir, file),
          path.join(targetLogsDir, file)
        );
      }

      return true;
    } catch (error) {
      logger.error('Logs backup failed:', error);
      return false;
    }
  }

  /**
   * Создание ZIP архива
   */
  private async createZipArchive(sourceDir: string, targetZip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetZip);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Копирование директории рекурсивно
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Сохранение информации о бэкапе в БД
   */
  private async saveBackupInfo(
    backupId: string,
    filename: string,
    size: number,
    userId: number
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO backups (backup_id, filename, size, created_by, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [backupId, filename, size, userId]
      );
    } catch (error) {
      logger.error('Error saving backup info:', error);
    }
  }

  /**
   * Получение списка бэкапов
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const result = await pool.query(
        `SELECT backup_id as id, filename, size, created_at
         FROM backups
         ORDER BY created_at DESC
         LIMIT 20`
      );

      return result.rows.map(row => ({
        ...row,
        components: ['database', 'redis', 'files', 'config', 'logs'],
      }));
    } catch (error) {
      logger.error('Error listing backups:', error);
      return [];
    }
  }

  /**
   * Скачивание бэкапа
   */
  async getBackupPath(backupId: string): Promise<string | null> {
    try {
      const result = await pool.query(
        'SELECT filename FROM backups WHERE backup_id = $1',
        [backupId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const filename = result.rows[0].filename;
      const backupPath = path.join(this.BACKUP_DIR, filename);

      // Проверка существования файла
      await fs.access(backupPath);
      return backupPath;
    } catch (error) {
      logger.error('Error getting backup path:', error);
      return null;
    }
  }

  /**
   * Удаление бэкапа
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT filename FROM backups WHERE backup_id = $1',
        [backupId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const filename = result.rows[0].filename;
      const backupPath = path.join(this.BACKUP_DIR, filename);

      // Удаление файла
      await fs.rm(backupPath, { force: true });

      // Удаление записи из БД
      await pool.query('DELETE FROM backups WHERE backup_id = $1', [backupId]);

      return true;
    } catch (error) {
      logger.error('Error deleting backup:', error);
      return false;
    }
  }

  /**
   * Очистка старых бэкапов
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      // Получение списка старых бэкапов
      const result = await pool.query(
        `SELECT backup_id, filename
         FROM backups
         ORDER BY created_at DESC
         OFFSET $1`,
        [this.MAX_BACKUPS]
      );

      // Удаление старых бэкапов
      for (const row of result.rows) {
        await this.deleteBackup(row.backup_id);
      }
    } catch (error) {
      logger.error('Error cleaning up old backups:', error);
    }
  }

  /**
   * Получение статистики бэкапов
   */
  async getBackupStats(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_backups,
          SUM(size) as total_size,
          MAX(created_at) as last_backup,
          MIN(created_at) as oldest_backup
        FROM backups
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting backup stats:', error);
      return null;
    }
  }
}

export const backupService = new BackupService();
export default backupService;
