"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const priceHistoryService_1 = __importDefault(require("../../services/priceHistory/priceHistoryService"));
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.optionalAuthMiddleware);
// Получить историю цен для товара
router.get('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const marketplace = req.query.marketplace;
        const days = Number(req.query.days) || 30;
        if (!marketplace) {
            return res.status(400).json({ error: 'Marketplace parameter is required' });
        }
        if (days < 1 || days > 365) {
            return res.status(400).json({ error: 'Days must be between 1 and 365' });
        }
        const history = await priceHistoryService_1.default.getPriceHistory(productId, marketplace, days);
        res.json({ history });
    }
    catch (error) {
        console.error('❌ Get price history error:', error);
        res.status(500).json({ error: 'Failed to get price history' });
    }
});
// Записать текущую цену в историю (внутренний endpoint)
router.post('/', async (req, res) => {
    try {
        const { productId, marketplace, price } = req.body;
        if (!productId || !marketplace || typeof price !== 'number') {
            return res.status(400).json({ error: 'Product ID, marketplace, and price are required' });
        }
        if (price < 0) {
            return res.status(400).json({ error: 'Price must be positive' });
        }
        await priceHistoryService_1.default.recordPrice(productId, marketplace, price);
        res.json({ message: 'Price recorded' });
    }
    catch (error) {
        console.error('❌ Record price error:', error);
        res.status(500).json({ error: 'Failed to record price' });
    }
});
exports.default = router;
