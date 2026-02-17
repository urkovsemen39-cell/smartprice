"use strict";
// Сервис для сбора метрик (Prometheus-compatible)
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
class MetricsService {
    constructor() {
        this.metrics = new Map();
        this.counters = new Map();
        this.histograms = new Map();
    }
    // Счетчики (Counter)
    incrementCounter(name, labels) {
        const key = this.getKey(name, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + 1);
    }
    // Гистограммы (Histogram) - для времени выполнения
    recordHistogram(name, value, labels) {
        const key = this.getKey(name, labels);
        const values = this.histograms.get(key) || [];
        values.push(value);
        // Храним только последние 1000 значений
        if (values.length > 1000) {
            values.shift();
        }
        this.histograms.set(key, values);
    }
    // Gauge - текущее значение
    setGauge(name, value, labels) {
        const key = this.getKey(name, labels);
        this.metrics.set(key, {
            name,
            value,
            labels,
            timestamp: Date.now(),
        });
    }
    // Получить все метрики в формате Prometheus
    getMetrics() {
        const lines = [];
        // Counters
        for (const [key, value] of this.counters.entries()) {
            const { name, labels } = this.parseKey(key);
            const labelsStr = this.formatLabels(labels);
            lines.push(`${name}${labelsStr} ${value}`);
        }
        // Gauges
        for (const [key, metric] of this.metrics.entries()) {
            const labelsStr = this.formatLabels(metric.labels);
            lines.push(`${metric.name}${labelsStr} ${metric.value}`);
        }
        // Histograms (summary)
        for (const [key, values] of this.histograms.entries()) {
            const { name, labels } = this.parseKey(key);
            const labelsStr = this.formatLabels(labels);
            if (values.length > 0) {
                const sorted = [...values].sort((a, b) => a - b);
                const sum = values.reduce((a, b) => a + b, 0);
                const count = values.length;
                const p50 = sorted[Math.floor(count * 0.5)];
                const p95 = sorted[Math.floor(count * 0.95)];
                const p99 = sorted[Math.floor(count * 0.99)];
                lines.push(`${name}_sum${labelsStr} ${sum}`);
                lines.push(`${name}_count${labelsStr} ${count}`);
                lines.push(`${name}_p50${labelsStr} ${p50}`);
                lines.push(`${name}_p95${labelsStr} ${p95}`);
                lines.push(`${name}_p99${labelsStr} ${p99}`);
            }
        }
        return lines.join('\n');
    }
    // Получить метрики в JSON формате
    getMetricsJSON() {
        const result = {
            counters: {},
            gauges: {},
            histograms: {},
        };
        // Counters
        for (const [key, value] of this.counters.entries()) {
            const { name, labels } = this.parseKey(key);
            if (!result.counters[name])
                result.counters[name] = [];
            result.counters[name].push({ labels, value });
        }
        // Gauges
        for (const [key, metric] of this.metrics.entries()) {
            if (!result.gauges[metric.name])
                result.gauges[metric.name] = [];
            result.gauges[metric.name].push({
                labels: metric.labels,
                value: metric.value,
                timestamp: metric.timestamp,
            });
        }
        // Histograms
        for (const [key, values] of this.histograms.entries()) {
            const { name, labels } = this.parseKey(key);
            if (!result.histograms[name])
                result.histograms[name] = [];
            if (values.length > 0) {
                const sorted = [...values].sort((a, b) => a - b);
                const sum = values.reduce((a, b) => a + b, 0);
                const count = values.length;
                result.histograms[name].push({
                    labels,
                    sum,
                    count,
                    avg: sum / count,
                    p50: sorted[Math.floor(count * 0.5)],
                    p95: sorted[Math.floor(count * 0.95)],
                    p99: sorted[Math.floor(count * 0.99)],
                });
            }
        }
        return result;
    }
    // Очистить старые метрики
    cleanup() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 час
        for (const [key, metric] of this.metrics.entries()) {
            if (now - metric.timestamp > maxAge) {
                this.metrics.delete(key);
            }
        }
    }
    getKey(name, labels) {
        if (!labels || Object.keys(labels).length === 0) {
            return name;
        }
        const labelsStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelsStr}}`;
    }
    parseKey(key) {
        const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
        if (!match)
            return { name: key };
        const name = match[1];
        const labelsStr = match[2];
        if (!labelsStr)
            return { name };
        const labels = {};
        const pairs = labelsStr.match(/(\w+)="([^"]+)"/g) || [];
        for (const pair of pairs) {
            const [k, v] = pair.split('=');
            labels[k] = v.replace(/"/g, '');
        }
        return { name, labels };
    }
    formatLabels(labels) {
        if (!labels || Object.keys(labels).length === 0) {
            return '';
        }
        const labelsStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `{${labelsStr}}`;
    }
}
exports.MetricsService = MetricsService;
exports.default = new MetricsService();
