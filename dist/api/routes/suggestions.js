"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const advancedCacheService_1 = require("../../services/cache/advancedCacheService");
const analyticsService_1 = __importDefault(require("../../services/analytics/analyticsService"));
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json({ suggestions: [] });
        }
        if (query.length > 200) {
            return res.status(400).json({ error: 'Query is too long (max 200 characters)' });
        }
        const cached = await advancedCacheService_1.advancedCacheService.getCachedSuggestions(query);
        if (cached) {
            return res.json({ suggestions: cached });
        }
        const popularQueries = await analyticsService_1.default.getPopularQueries(50);
        const suggestions = popularQueries
            .filter(q => q.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
        await advancedCacheService_1.advancedCacheService.cacheSuggestions(query, suggestions);
        res.json({ suggestions });
    }
    catch (error) {
        logger_1.default.error('❌ Suggestions error:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});
exports.default = router;
