"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const metricsService_1 = __importDefault(require("../../services/monitoring/metricsService"));
describe('MetricsService', () => {
    beforeEach(() => {
        // Очищаем метрики перед каждым тестом
        metricsService_1.default['counters'].clear();
        metricsService_1.default['metrics'].clear();
        metricsService_1.default['histograms'].clear();
    });
    describe('incrementCounter', () => {
        it('should increment counter', () => {
            metricsService_1.default.incrementCounter('test_counter');
            metricsService_1.default.incrementCounter('test_counter');
            const metrics = metricsService_1.default.getMetricsJSON();
            expect(metrics.counters.test_counter[0].value).toBe(2);
        });
        it('should increment counter with labels', () => {
            metricsService_1.default.incrementCounter('test_counter', { method: 'GET' });
            metricsService_1.default.incrementCounter('test_counter', { method: 'POST' });
            const metrics = metricsService_1.default.getMetricsJSON();
            expect(metrics.counters.test_counter).toHaveLength(2);
        });
    });
    describe('setGauge', () => {
        it('should set gauge value', () => {
            metricsService_1.default.setGauge('test_gauge', 42);
            const metrics = metricsService_1.default.getMetricsJSON();
            expect(metrics.gauges.test_gauge[0].value).toBe(42);
        });
        it('should update gauge value', () => {
            metricsService_1.default.setGauge('test_gauge', 42);
            metricsService_1.default.setGauge('test_gauge', 100);
            const metrics = metricsService_1.default.getMetricsJSON();
            expect(metrics.gauges.test_gauge[0].value).toBe(100);
        });
    });
    describe('recordHistogram', () => {
        it('should record histogram values', () => {
            metricsService_1.default.recordHistogram('test_histogram', 10);
            metricsService_1.default.recordHistogram('test_histogram', 20);
            metricsService_1.default.recordHistogram('test_histogram', 30);
            const metrics = metricsService_1.default.getMetricsJSON();
            const histogram = metrics.histograms.test_histogram[0];
            expect(histogram.count).toBe(3);
            expect(histogram.sum).toBe(60);
            expect(histogram.avg).toBe(20);
        });
        it('should calculate percentiles correctly', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            values.forEach(v => metricsService_1.default.recordHistogram('test_histogram', v));
            const metrics = metricsService_1.default.getMetricsJSON();
            const histogram = metrics.histograms.test_histogram[0];
            expect(histogram.p50).toBeGreaterThanOrEqual(5);
            expect(histogram.p95).toBeGreaterThanOrEqual(9);
            expect(histogram.p99).toBeGreaterThanOrEqual(10);
        });
    });
    describe('getMetrics', () => {
        it('should return Prometheus format', () => {
            metricsService_1.default.incrementCounter('test_counter');
            metricsService_1.default.setGauge('test_gauge', 42);
            const metrics = metricsService_1.default.getMetrics();
            expect(metrics).toContain('test_counter');
            expect(metrics).toContain('test_gauge');
            expect(metrics).toContain('42');
        });
    });
});
