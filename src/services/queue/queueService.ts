import Bull, { Queue, Job } from 'bull';
import { emailService } from '../email/emailService';
import logger from '../../utils/logger';

// Типы задач
interface EmailJob {
  type: 'verification' | 'price_alert' | 'welcome' | 'session_alert';
  to: string;
  data: any;
}

interface AnalyticsJob {
  type: 'click' | 'search' | 'conversion';
  data: any;
}

interface ReportJob {
  userId: number;
  reportType: 'favorites' | 'price_history' | 'analytics';
  format: 'json' | 'csv' | 'pdf';
}

class QueueService {
  private emailQueue: Queue<EmailJob>;
  private analyticsQueue: Queue<AnalyticsJob>;
  private reportQueue: Queue<ReportJob>;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };

    // Создание очередей
    this.emailQueue = new Bull('email', { redis: redisConfig });
    this.analyticsQueue = new Bull('analytics', { redis: redisConfig });
    this.reportQueue = new Bull('reports', { redis: redisConfig });

    // Настройка обработчиков
    this.setupProcessors();

    logger.info('Queue service initialized');
  }

  private setupProcessors() {
    // Email обработчик
    this.emailQueue.process(async (job: Job<EmailJob>) => {
      logger.info(`Processing email job: ${job.data.type}`);
      
      try {
        switch (job.data.type) {
          case 'verification':
            await emailService.sendVerificationEmail(job.data.to, job.data.data.code);
            break;
          case 'price_alert':
            await emailService.sendPriceAlert(
              job.data.to,
              job.data.data.productName,
              job.data.data.targetPrice,
              job.data.data.currentPrice,
              job.data.data.productUrl
            );
            break;
          case 'welcome':
            await emailService.sendWelcomeEmail(job.data.to, job.data.data.name);
            break;
          case 'session_alert':
            await emailService.sendNewSessionAlert(
              job.data.to,
              job.data.data.ip,
              job.data.data.userAgent
            );
            break;
        }
        
        logger.info(`Email job completed: ${job.data.type}`);
      } catch (error) {
        logger.error(`Email job failed: ${job.data.type}`, error);
        throw error; // Для retry
      }
    });

    // Analytics обработчик
    this.analyticsQueue.process(async (job: Job<AnalyticsJob>) => {
      logger.info(`Processing analytics job: ${job.data.type}`);
      
      try {
        // Здесь можно добавить обработку аналитики
        // Например, агрегация данных, отправка в внешние системы и т.д.
        
        logger.info(`Analytics job completed: ${job.data.type}`);
      } catch (error) {
        logger.error(`Analytics job failed: ${job.data.type}`, error);
        throw error;
      }
    });

    // Report обработчик
    this.reportQueue.process(async (job: Job<ReportJob>) => {
      logger.info(`Processing report job: ${job.data.reportType}`);
      
      try {
        // Здесь можно добавить генерацию отчетов
        
        logger.info(`Report job completed: ${job.data.reportType}`);
      } catch (error) {
        logger.error(`Report job failed: ${job.data.reportType}`, error);
        throw error;
      }
    });

    // Обработка ошибок
    this.emailQueue.on('failed', (job, err) => {
      logger.error(`Email job ${job.id} failed:`, err.message);
    });

    this.analyticsQueue.on('failed', (job, err) => {
      logger.error(`Analytics job ${job.id} failed:`, err.message);
    });

    this.reportQueue.on('failed', (job, err) => {
      logger.error(`Report job ${job.id} failed:`, err.message);
    });
  }

  // Добавление email задачи
  async addEmailJob(job: EmailJob): Promise<void> {
    await this.emailQueue.add(job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  // Добавление analytics задачи
  async addAnalyticsJob(job: AnalyticsJob): Promise<void> {
    await this.analyticsQueue.add(job, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
    });
  }

  // Добавление report задачи
  async addReportJob(job: ReportJob): Promise<void> {
    await this.reportQueue.add(job, {
      attempts: 1,
      removeOnComplete: false, // Сохраняем для истории
    });
  }

  // Статистика очередей
  async getQueueStats() {
    const emailStats = {
      waiting: await this.emailQueue.getWaitingCount(),
      active: await this.emailQueue.getActiveCount(),
      completed: await this.emailQueue.getCompletedCount(),
      failed: await this.emailQueue.getFailedCount(),
    };

    const analyticsStats = {
      waiting: await this.analyticsQueue.getWaitingCount(),
      active: await this.analyticsQueue.getActiveCount(),
      completed: await this.analyticsQueue.getCompletedCount(),
      failed: await this.analyticsQueue.getFailedCount(),
    };

    const reportStats = {
      waiting: await this.reportQueue.getWaitingCount(),
      active: await this.reportQueue.getActiveCount(),
      completed: await this.reportQueue.getCompletedCount(),
      failed: await this.reportQueue.getFailedCount(),
    };

    return {
      email: emailStats,
      analytics: analyticsStats,
      reports: reportStats,
    };
  }

  // Очистка завершенных задач
  async cleanQueues(): Promise<void> {
    await this.emailQueue.clean(24 * 60 * 60 * 1000); // 24 часа
    await this.analyticsQueue.clean(24 * 60 * 60 * 1000);
    await this.reportQueue.clean(7 * 24 * 60 * 60 * 1000); // 7 дней
    
    logger.info('Queues cleaned');
  }

  // Graceful shutdown
  async close(): Promise<void> {
    await this.emailQueue.close();
    await this.analyticsQueue.close();
    await this.reportQueue.close();
    
    logger.info('Queue service closed');
  }
}

export const queueService = new QueueService();
