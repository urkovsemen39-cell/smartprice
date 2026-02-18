"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = __importDefault(require("../../utils/logger"));
const constants_1 = require("../../config/constants");
const router = (0, express_1.Router)();
// Сравнение товаров (stateless - данные приходят с клиента)
router.post('/', async (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ error: 'Products must be an array' });
        }
        if (products.length < 2 || products.length > constants_1.UI.MAX_COMPARE_PRODUCTS) {
            return res.status(400).json({
                error: `You can compare 2 to ${constants_1.UI.MAX_COMPARE_PRODUCTS} products`
            });
        }
        // Валидация каждого товара
        for (const product of products) {
            if (!product.id || !product.name || typeof product.price !== 'number') {
                return res.status(400).json({ error: 'Invalid product data' });
            }
        }
        // Вычисляем сравнительные метрики
        const comparison = {
            products,
            bestPrice: products.reduce((min, p) => p.price < min.price ? p : min),
            bestRating: products.reduce((max, p) => p.rating > max.rating ? p : max),
            fastestDelivery: products.reduce((min, p) => p.deliveryDays < min.deliveryDays ? p : min),
            averagePrice: products.reduce((sum, p) => sum + p.price, 0) / products.length,
            priceRange: {
                min: Math.min(...products.map(p => p.price)),
                max: Math.max(...products.map(p => p.price)),
            },
        };
        res.json(comparison);
    }
    catch (error) {
        logger_1.default.error('Compare error:', error);
        res.status(500).json({ error: 'Failed to compare products' });
    }
});
exports.default = router;
