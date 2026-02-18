"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const searchService_1 = require("../../services/search/searchService");
const auth_1 = require("../../middleware/auth");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.optionalAuthMiddleware);
router.get('/', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Query parameter "q" is required'
            });
        }
        if (query.length > 200) {
            return res.status(400).json({
                error: 'Query is too long (max 200 characters)'
            });
        }
        const params = {
            query: query.trim(),
            filters: {
                minPrice: req.query.minPrice ? Math.max(0, Number(req.query.minPrice)) : undefined,
                maxPrice: req.query.maxPrice ? Math.max(0, Number(req.query.maxPrice)) : undefined,
                minRating: req.query.minRating ? Math.max(0, Math.min(5, Number(req.query.minRating))) : undefined,
                freeDelivery: req.query.freeDelivery === 'true',
                inStockOnly: req.query.inStockOnly === 'true',
            },
            sort: req.query.sort || 'smart',
            page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
            limit: req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 20,
        };
        const result = await (0, searchService_1.searchProducts)(params, req.userId);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Search error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
