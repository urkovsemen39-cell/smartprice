"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsMiddleware = metricsMiddleware;
exports.errorMetricsMiddleware = errorMetricsMiddleware;
const metricsService_1 = __importDefault(require("../services/monitoring/metricsService"));
// Middleware для сбора метрик HTTP запросов
function metricsMiddleware(req, res, next) {
    const startTime = Date.now();
    // Перехватываем завершение ответа
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const route = req.route?.path || req.path;
        const method = req.method;
        const statusCode = res.statusCode;
        // Счетчик запросов
        metricsService_1.default.incrementCounter('http_requests_total', {
            method,
            route,
            status: statusCode.toString(),
        });
        // Время выполнения запроса
        metricsService_1.default.recordHistogram('http_request_duration_ms', duration, {
            method,
            route,
        });
        // Размер ответа
        const contentLength = res.get('content-length');
        if (contentLength) {
            metricsService_1.default.recordHistogram('http_response_size_bytes', parseInt(contentLength), {
                method,
                route,
            });
        }
    });
    next();
}
// Middleware для сбора метрик ошибок
function errorMetricsMiddleware(err, req, res, next) {
    metricsService_1.default.incrementCounter('http_errors_total', {
        method: req.method,
        route: req.route?.path || req.path,
        error: err.name || 'UnknownError',
    });
    next(err);
}
