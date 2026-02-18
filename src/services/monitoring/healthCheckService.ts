/**
 * Health Check Service
 * Комплексная проверка здоровья всех компонентов системы
 */

import { pool, checkDatabaseHealth } from '../../config/database';
import { redisClient } from '../../config/redis';
import { GracefulDegradation } from '../../utils/gracefulDegradation';
import { circuitBreakers } from '../../utils/circuitBreaker';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    cache: ServiceHealth;
    circuitBreakers: CircuitBreakerHealth[];
  };
  system: {
    memory: MemoryUsage;
    cpu: number;
  };
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  message?: string;
  details?: any;
}

interface CircuitBreakerHealth {
  name: string;
  state: string;
  failureCount: number;
}

interface MemoryUsage {
  used: string;
  total: string;
  percentage: number;
}

class HealthCheckService {
  /**
   * Полная проверка здоровья системы
   */
  async getFullHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    // Проверка всех сервисов параллельно
    const [database, redis, cache] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkCache(),
    ]);

    const circuitBreakersHealth = this.checkCircuitBreakers();
    const system = this.getSystemMetrics();

    // Определение общего статуса
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (database.status === 'down') {
      overallStatus = 'unhealthy';
    } else if (redis.status === 'down' || cache.status === 'degraded') {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database,
        redis,
        cache,
        circuitBreakers: circuitBreakersHealth,
      },
      system,
    };
  }

  /**
   * Быстрая проверка (для liveness probe)
   */
  async getQuickHealth(): Promise<{ status: 'ok' | 'error' }> {
    try {
      // Проверяем только критичные компоненты
      const dbHealthy = await checkDatabaseHealth();
      return { status: dbHealthy ? 'ok' : 'error' };
    } catch (error) {
      return { status: 'error' };
    }
  }

  /**
   * Проверка готовности (для readiness probe)
   */
  async getReadiness(): Promise<{ ready: boolean; services: string[] }> {
    const notReady: string[] = [];

    // Проверка БД
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      notReady.push('database');
    }

    // Проверка Redis (не критично, но желательно)
    if (!GracefulDegradation.isRedisAvailable()) {
      notReady.push('redis');
    }

    return {
      ready: notReady.length === 0,
      services: notReady,
    };
  }

  /**
   * Проверка базы данных
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      await pool.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      // Проверка количества активных соединений
      const poolStats = pool.totalCount;

      return {
        status: 'up',
        responseTime,
        details: {
          totalConnections: poolStats,
          maxConnections: pool.options.max,
        },
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }

  /**
   * Проверка Redis
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const startTime = Date.now();

    if (!GracefulDegradation.isRedisAvailable()) {
      return {
        status: 'down',
        message: 'Redis unavailable, using fallback',
      };
    }

    try {
      await redisClient.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'up',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Redis connection failed',
      };
    }
  }

  /**
   * Проверка кэша
   */
  private async checkCache(): Promise<ServiceHealth> {
    const memoryCacheStats = GracefulDegradation.getMemoryCacheStats();

    if (!GracefulDegradation.isRedisAvailable()) {
      return {
        status: 'degraded',
        message: 'Using in-memory cache fallback',
        details: memoryCacheStats,
      };
    }

    return {
      status: 'up',
      details: memoryCacheStats,
    };
  }

  /**
   * Проверка Circuit Breakers
   */
  private checkCircuitBreakers(): CircuitBreakerHealth[] {
    return Object.values(circuitBreakers).map(cb => {
      const stats = cb.getStats();
      return {
        name: stats.name,
        state: stats.state,
        failureCount: stats.failureCount,
      };
    });
  }

  /**
   * Системные метрики
   */
  private getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;

    return {
      memory: {
        used: this.formatBytes(usedMem),
        total: this.formatBytes(totalMem),
        percentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: process.cpuUsage().user / 1000000, // Convert to seconds
    };
  }

  /**
   * Форматирование байтов
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export const healthCheckService = new HealthCheckService();
export default healthCheckService;
