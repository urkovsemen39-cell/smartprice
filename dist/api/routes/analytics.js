"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsService_1 = __importDefault(require("../../services/analytics/analyticsService"));
const auth_1 = require("../../middleware/auth");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.post('/click', auth_1.optionalAuthMiddleware, async (req, res) => {
    try {
        const { productId, marketplace, query } = req.body;
        if (!productId || !marketplace) {
            return res.status(400).json({ error: 'Product ID and marketplace are required' });
        }
        await analyticsService_1.default.trackClick(req.userId || null, productId, marketplace, query);
        res.json({ message: 'Click tracked' });
    }
    catch (error) {
        logger_1.default.error('Track click error:', error);
        res.status(500).json({ error: 'Failed to track click' });
    }
});
router.get('/popular-queries', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 10;
        const queries = await analyticsService_1.default.getPopularQueries(limit);
        res.json({ queries });
    }
    catch (error) {
        logger_1.default.error('Get popular queries error:', error);
        res.status(500).json({ error: 'Failed to get popular queries' });
    }
});
router.get('/history', auth_1.authMiddleware, async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 20;
        const history = await analyticsService_1.default.getUserSearchHistory(req.userId, limit);
        res.json({ history });
    }
    catch (error) {
        logger_1.default.error('Get search history error:', error);
        res.status(500).json({ error: 'Failed to get search history' });
    }
});
exports.default = router;
