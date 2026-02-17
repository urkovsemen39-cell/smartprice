"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const metricsService_1 = __importDefault(require("../../services/monitoring/metricsService"));
const database_1 = __importDefault(require("../../config/database"));
const redis_1 = __importDefault(require("../../config/redis"));
const router = (0, express_1.Router)();
// Prometheus metrics endpoint
router.get('/', async (req, res) => {
    try {
        const metrics = metricsService_1.default.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    }
    catch (error) {
        console.error('❌ Metrics error:', error);
        res.status(500).send('Failed to get metrics');
    }
});
// JSON metrics endpoint (для удобства просмотра)
router.get('/json', async (req, res) => {
    try {
        const metrics = metricsService_1.default.getMetricsJSON();
        // Добавляем системные метрики
        const systemMetrics = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            timestamp: new Date().toISOString(),
        };
        // Проверяем состояние сервисов
        const services = {
            database: 'unknown',
            redis: 'unknown',
        };
        try {
            await database_1.default.query('SELECT 1');
            services.database = 'ok';
        }
        catch (e) {
            services.database = 'error';
        }
        try {
            await redis_1.default.ping();
            services.redis = 'ok';
        }
        catch (e) {
            services.redis = 'error';
        }
        res.json({
            system: systemMetrics,
            services,
            metrics,
        });
    }
    catch (error) {
        console.error('❌ Metrics JSON error:', error);
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});
exports.default = router;
