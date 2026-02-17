// Email сервис для отправки уведомлений
// Поддерживает SendGrid, AWS SES, и Nodemailer

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

type EmailProvider = 'sendgrid' | 'aws-ses' | 'nodemailer' | 'none';

export class EmailService {
  private provider: EmailProvider;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.provider = (process.env.EMAIL_PROVIDER as EmailProvider) || 'none';
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@smartprice.ru';
    this.fromName = process.env.EMAIL_FROM_NAME || 'SmartPrice';

    if (this.provider !== 'none') {
      console.log(`✅ Email service initialized with provider: ${this.provider}`);
    } else {
      console.log('📧 Email service in development mode (logging only)');
    }
  }

  async sendPriceAlert(
    email: string,
    productName: string,
    targetPrice: number,
    currentPrice: number,
    productUrl: string
  ): Promise<boolean> {
    const subject = `🎉 Цена снизилась: ${productName}`;
    const html = `
      <h2>Отличные новости!</h2>
      <p>Цена на товар <strong>${productName}</strong> достигла вашей целевой цены!</p>
      <ul>
        <li>Целевая цена: <strong>${targetPrice.toLocaleString('ru-RU')} ₽</strong></li>
        <li>Текущая цена: <strong>${currentPrice.toLocaleString('ru-RU')} ₽</strong></li>
        <li>Экономия: <strong>${(targetPrice - currentPrice).toLocaleString('ru-RU')} ₽</strong></li>
      </ul>
      <p><a href="${productUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Купить сейчас</a></p>
      <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от SmartPrice</p>
    `;

    return this.send({
      to: email,
      subject,
      html,
      text: `Цена на ${productName} снизилась до ${currentPrice} ₽! Целевая цена: ${targetPrice} ₽. Ссылка: ${productUrl}`,
    });
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<boolean> {
    const subject = 'Добро пожаловать в SmartPrice!';
    const html = `
      <h2>Привет${name ? `, ${name}` : ''}!</h2>
      <p>Спасибо за регистрацию в SmartPrice - умном агрегаторе товаров.</p>
      <h3>Что вы можете делать:</h3>
      <ul>
        <li>🔍 Искать товары по лучшей цене</li>
        <li>❤️ Добавлять товары в избранное</li>
        <li>📊 Отслеживать изменения цен</li>
        <li>📈 Просматривать историю цен</li>
        <li>⚖️ Сравнивать товары</li>
      </ul>
      <p>Начните с поиска вашего первого товара!</p>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Перейти к поиску</a></p>
    `;

    return this.send({
      to: email,
      subject,
      html,
      text: `Добро пожаловать в SmartPrice! Начните искать товары по лучшей цене.`,
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    const subject = 'Подтверждение email - SmartPrice';
    const html = `
      <h2>Подтверждение email</h2>
      <p>Ваш код подтверждения:</p>
      <h1 style="font-size: 32px; letter-spacing: 8px; color: #3B82F6;">${code}</h1>
      <p>Код действителен в течение 15 минут.</p>
      <p style="color: #666; font-size: 12px;">Если вы не регистрировались на SmartPrice, проигнорируйте это письмо.</p>
    `;

    return this.send({
      to: email,
      subject,
      html,
      text: `Ваш код подтверждения: ${code}. Код действителен 15 минут.`,
    });
  }

  async sendNewSessionAlert(email: string, ip: string, userAgent: string): Promise<boolean> {
    const subject = 'Новый вход в аккаунт - SmartPrice';
    const html = `
      <h2>Обнаружен новый вход в ваш аккаунт</h2>
      <p>Детали входа:</p>
      <ul>
        <li><strong>IP адрес:</strong> ${ip}</li>
        <li><strong>Устройство:</strong> ${userAgent}</li>
        <li><strong>Время:</strong> ${new Date().toLocaleString('ru-RU')}</li>
      </ul>
      <p>Если это были не вы, немедленно смените пароль и завершите все сессии в настройках аккаунта.</p>
      <p><a href="${process.env.FRONTEND_URL}/profile/sessions" style="background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Управление сессиями</a></p>
    `;

    return this.send({
      to: email,
      subject,
      html,
      text: `Обнаружен новый вход в ваш аккаунт с IP ${ip}. Если это были не вы, смените пароль.`,
    });
  }

  private async send(options: EmailOptions): Promise<boolean> {
    // Development mode - только логирование
    if (this.provider === 'none') {
      console.log('📧 Email (dev mode):', {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        preview: options.text?.substring(0, 100),
      });
      return true;
    }

    try {
      switch (this.provider) {
        case 'sendgrid':
          return await this.sendWithSendGrid(options);
        case 'aws-ses':
          return await this.sendWithAWSSES(options);
        case 'nodemailer':
          return await this.sendWithNodemailer(options);
        default:
          console.warn('⚠️ Unknown email provider:', this.provider);
          return false;
      }
    } catch (error) {
      console.error('❌ Email send error:', error);
      return false;
    }
  }

  private async sendWithSendGrid(options: EmailOptions): Promise<boolean> {
    try {
      // Динамический импорт SendGrid (устанавливается опционально)
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      await sgMail.send({
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log('✅ Email sent via SendGrid:', options.to);
      return true;
    } catch (error) {
      console.error('❌ SendGrid error:', error);
      return false;
    }
  }

  private async sendWithAWSSES(options: EmailOptions): Promise<boolean> {
    try {
      // Динамический импорт AWS SDK (устанавливается опционально)
      const AWS = require('aws-sdk');
      
      const ses = new AWS.SES({
        region: process.env.AWS_SES_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_SES_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SES_SECRET_KEY,
      });

      const params = {
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: 'UTF-8',
            },
            Text: options.text ? {
              Data: options.text,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
      };

      await ses.sendEmail(params).promise();
      console.log('✅ Email sent via AWS SES:', options.to);
      return true;
    } catch (error) {
      console.error('❌ AWS SES error:', error);
      return false;
    }
  }

  private async sendWithNodemailer(options: EmailOptions): Promise<boolean> {
    try {
      // Динамический импорт Nodemailer (устанавливается опционально)
      const nodemailer = require('nodemailer');

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log('✅ Email sent via Nodemailer:', options.to);
      return true;
    } catch (error) {
      console.error('❌ Nodemailer error:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
export default emailService;
