/**
 * Circuit Breaker Pattern
 * Защита от каскадных сбоев при недоступности внешних сервисов
 */

import logger from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Нормальная работа
  OPEN = 'OPEN',         // Сервис недоступен, запросы блокируются
  HALF_OPEN = 'HALF_OPEN' // Тестирование восстановления
}

interface CircuitBreakerOptions {
  failureThreshold: number;      // Количество ошибок для открытия
  successThreshold: number;      // Количество успехов для закрытия
  timeout: number;               // Время до перехода в HALF_OPEN (мс)
  resetTimeout: number;          // Время сброса счетчика ошибок (мс)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private lastFailureTime = 0;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,        // 1 минута
      resetTimeout: 300000,  // 5 минут
    }
  ) {}

  /**
   * Выполнение функции с защитой Circuit Breaker
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    // Проверка состояния
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn(`Circuit breaker [${this.name}] is OPEN, using fallback`);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
      // Переход в HALF_OPEN для тестирования
      this.state = CircuitState.HALF_OPEN;
      logger.info(`Circuit breaker [${this.name}] entering HALF_OPEN state`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  /**
   * Обработка успешного выполнения
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit breaker [${this.name}] is now CLOSED`);
      }
    }
  }

  /**
   * Обработка ошибки
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      this.successCount = 0;
      logger.error(`Circuit breaker [${this.name}] is now OPEN (failed in HALF_OPEN)`);
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      logger.error(`Circuit breaker [${this.name}] is now OPEN (threshold reached)`);
    }

    // Сброс счетчика после resetTimeout
    if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
      this.failureCount = 0;
    }
  }

  /**
   * Получение текущего состояния
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt) : null,
    };
  }

  /**
   * Ручной сброс
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    logger.info(`Circuit breaker [${this.name}] manually reset`);
  }
}

// Глобальные circuit breakers для внешних сервисов
export const circuitBreakers = {
  yandexMarket: new CircuitBreaker('YandexMarket', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 180000,
  }),
  aliexpress: new CircuitBreaker('AliExpress', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 180000,
  }),
  admitad: new CircuitBreaker('Admitad', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 180000,
  }),
  email: new CircuitBreaker('EmailService', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    resetTimeout: 300000,
  }),
};

export default CircuitBreaker;
