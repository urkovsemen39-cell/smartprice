"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cacheService_1 = __importDefault(require("../../services/cache/cacheService"));
const analyticsService_1 = __importDefault(require("../../services/analytics/analyticsService"));
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
        const cached = await cacheService_1.default.getCachedSuggestions(query);
        if (cached) {
            return res.json({ suggestions: cached });
        }
        const popularQueries = await analyticsService_1.default.getPopularQueries(50);
        const suggestions = popularQueries
            .filter(q => q.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
        await cacheService_1.default.cacheSuggestions(query, suggestions);
        res.json({ suggestions });
    }
    catch (error) {
        console.error('❌ Suggestions error:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});
exports.default = router;
