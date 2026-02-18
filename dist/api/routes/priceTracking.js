"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const priceTrackingService_1 = __importDefault(require("../../services/priceTracking/priceTrackingService"));
const auth_1 = require("../../middleware/auth");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.activeOnly !== 'false';
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const result = await priceTrackingService_1.default.getAlerts(req.userId, activeOnly, page, limit);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Get alerts error:', error);
        res.status(500).json({ error: 'Failed to get price alerts' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { productId, marketplace, productName, targetPrice, currentPrice, productUrl } = req.body;
        // Валидация
        if (!productId || typeof productId !== 'string') {
            return res.status(400).json({ error: 'Valid product ID is required' });
        }
        if (!marketplace || typeof marketplace !== 'string') {
            return res.status(400).json({ error: 'Valid marketplace is required' });
        }
        if (typeof targetPrice !== 'number' || targetPrice <= 0) {
            return res.status(400).json({ error: 'Valid target price is required (must be positive)' });
        }
        if (typeof currentPrice !== 'number' || currentPrice <= 0) {
            return res.status(400).json({ error: 'Valid current price is required (must be positive)' });
        }
        if (targetPrice >= currentPrice) {
            return res.status(400).json({ error: 'Target price must be lower than current price' });
        }
        const alert = await priceTrackingService_1.default.createAlert(req.userId, productId, marketplace, productName, targetPrice, currentPrice, productUrl);
        res.json({ alert });
    }
    catch (error) {
        logger_1.default.error('Create alert error:', error);
        res.status(500).json({ error: 'Failed to create price alert' });
    }
});
router.patch('/:alertId/deactivate', async (req, res) => {
    try {
        const alertId = Number(req.params.alertId);
        const success = await priceTrackingService_1.default.deactivateAlert(req.userId, alertId);
        if (success) {
            res.json({ message: 'Alert deactivated' });
        }
        else {
            res.status(404).json({ error: 'Alert not found' });
        }
    }
    catch (error) {
        logger_1.default.error('Deactivate alert error:', error);
        res.status(500).json({ error: 'Failed to deactivate alert' });
    }
});
router.delete('/:alertId', async (req, res) => {
    try {
        const alertId = Number(req.params.alertId);
        const success = await priceTrackingService_1.default.deleteAlert(req.userId, alertId);
        if (success) {
            res.json({ message: 'Alert deleted' });
        }
        else {
            res.status(404).json({ error: 'Alert not found' });
        }
    }
    catch (error) {
        logger_1.default.error('Delete alert error:', error);
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});
exports.default = router;
