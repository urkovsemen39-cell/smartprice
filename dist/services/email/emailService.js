"use strict";
// Email сервис для отправки уведомлений
// Поддерживает SendGrid, AWS SES, и Nodemailer
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = exports.EmailService = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
class EmailService {
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'none';
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@smartprice.ru';
        this.fromName = process.env.EMAIL_FROM_NAME || 'SmartPrice';
        if (this.provider !== 'none') {
            logger_1.default.info(`Email service initialized with provider: ${this.provider}`);
        }
        else {
            logger_1.default.info('Email service in development mode (logging only)');
        }
    }
    async sendPriceAlert(email, productName, targetPrice, currentPrice, productUrl) {
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
    async sendWelcomeEmail(email, name) {
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
    async sendVerificationEmail(email, code) {
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
    async sendNewSessionAlert(email, ip, userAgent) {
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
    async send(options) {
        // Development mode - только логирование
        if (this.provider === 'none') {
            logger_1.default.info('Email (dev mode):', {
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
                    logger_1.default.warn('Unknown email provider:', this.provider);
                    return false;
            }
        }
        catch (error) {
            logger_1.default.error('Email send error:', error);
            return false;
        }
    }
    async sendWithSendGrid(options) {
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
            logger_1.default.info('Email sent via SendGrid:', options.to);
            return true;
        }
        catch (error) {
            logger_1.default.error('SendGrid error:', error);
            return false;
        }
    }
    async sendWithAWSSES(options) {
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
            logger_1.default.info('Email sent via AWS SES:', options.to);
            return true;
        }
        catch (error) {
            logger_1.default.error('AWS SES error:', error);
            return false;
        }
    }
    async sendWithNodemailer(options) {
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
            logger_1.default.info('Email sent via Nodemailer:', options.to);
            return true;
        }
        catch (error) {
            logger_1.default.error('Nodemailer error:', error);
            return false;
        }
    }
}
exports.EmailService = EmailService;
exports.emailService = new EmailService();
exports.default = exports.emailService;
