import { pool } from '../../config/database';

interface QueryStats {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  maxTime: number;
}

interface TableStats {
  tableName: string;
  rowCount: number;
  totalSize: string;
  indexSize: string;
}

class DatabaseMonitoringService {
  // Включение pg_stat_statements
  async enableStatements(): Promise<void> {
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
      console.log('✅ pg_stat_statements enabled');
    } catch (error) {
      console.error('❌ Error enabling pg_stat_statements:', error);
    }
  }

  // Топ медленных запросов
  async getSlowQueries(limit: number = 10): Promise<QueryStats[]> {
    try {
      const result = await pool.query(
        `SELECT 
           query,
           calls,
           total_exec_time as total_time,
           mean_exec_time as mean_time,
           max_exec_time as max_time
         FROM pg_stat_statements
         WHERE query NOT LIKE '%pg_stat_statements%'
         ORDER BY mean_exec_time DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => ({
        query: row.query.substring(0, 200), // Обрезаем для читаемости
        calls: parseInt(row.calls),
        totalTime: parseFloat(row.total_time),
        meanTime: parseFloat(row.mean_time),
        maxTime: parseFloat(row.max_time),
      }));
    } catch (error) {
      console.error('❌ Error getting slow queries:', error);
      return [];
    }
  }

  // Статистика таблиц
  async getTableStats(): Promise<TableStats[]> {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname || '.' || tablename as table_name,
          n_live_tup as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);

      return result.rows.map(row => ({
        tableName: row.table_name,
        rowCount: parseInt(row.row_count),
        totalSize: row.total_size,
        indexSize: row.index_size,
      }));
    } catch (error) {
      console.error('❌ Error getting table stats:', error);
      return [];
    }
  }

  // Неиспользуемые индексы
  async getUnusedIndexes(): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname || '.' || tablename as table_name,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
          AND indexrelname NOT LIKE '%_pkey'
        ORDER BY pg_relation_size(indexrelid) DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('❌ Error getting unused indexes:', error);
      return [];
    }
  }

  // Рекомендации по индексам (на основе медленных запросов)
  async getIndexRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      const slowQueries = await this.getSlowQueries(5);
      
      for (const query of slowQueries) {
        if (query.meanTime > 100) { // Медленнее 100ms
          // Простой анализ - ищем WHERE условия
          const whereMatch = query.query.match(/WHERE\s+(\w+)\s*=/i);
          if (whereMatch) {
            recommendations.push(
              `Consider adding index on column: ${whereMatch[1]} (query time: ${query.meanTime.toFixed(2)}ms)`
            );
          }
        }
      }
    } catch (error) {
      console.error('❌ Error getting index recommendations:', error);
    }

    return recommendations;
  }

  // Статистика соединений
  async getConnectionStats(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT 
          count(*) as total,
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error getting connection stats:', error);
      return null;
    }
  }

  // Размер базы данных
  async getDatabaseSize(): Promise<string> {
    try {
      const result = await pool.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);

      return result.rows[0].size;
    } catch (error) {
      console.error('❌ Error getting database size:', error);
      return 'Unknown';
    }
  }

  // Автоматический VACUUM (проверка необходимости)
  async checkVacuumNeeded(): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname || '.' || tablename as table_name,
          n_dead_tup as dead_tuples,
          n_live_tup as live_tuples,
          ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000
          AND n_live_tup > 0
        ORDER BY dead_ratio DESC
      `);

      return result.rows.filter(row => parseFloat(row.dead_ratio) > 10);
    } catch (error) {
      console.error('❌ Error checking vacuum needed:', error);
      return [];
    }
  }

  // Выполнение VACUUM на таблице
  async vacuumTable(tableName: string): Promise<boolean> {
    try {
      await pool.query(`VACUUM ANALYZE ${tableName}`);
      console.log(`✅ VACUUM completed for ${tableName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error vacuuming ${tableName}:`, error);
      return false;
    }
  }

  // Полный отчет о состоянии БД
  async getFullReport(): Promise<any> {
    const [
      slowQueries,
      tableStats,
      unusedIndexes,
      indexRecommendations,
      connectionStats,
      databaseSize,
      vacuumNeeded,
    ] = await Promise.all([
      this.getSlowQueries(10),
      this.getTableStats(),
      this.getUnusedIndexes(),
      this.getIndexRecommendations(),
      this.getConnectionStats(),
      this.getDatabaseSize(),
      this.checkVacuumNeeded(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      databaseSize,
      connections: connectionStats,
      slowQueries,
      tableStats,
      unusedIndexes,
      indexRecommendations,
      vacuumNeeded,
    };
  }

  // Логирование медленного запроса
  async logSlowQuery(query: string, executionTime: number): Promise<void> {
    if (executionTime > 100) { // Медленнее 100ms
      console.warn(`⚠️ Slow query detected (${executionTime.toFixed(2)}ms):`, query.substring(0, 200));
    }
  }
}

export const databaseMonitoringService = new DatabaseMonitoringService();
