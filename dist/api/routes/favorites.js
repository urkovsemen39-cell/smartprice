"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const favoritesService_1 = __importDefault(require("../../services/favorites/favoritesService"));
const auth_1 = require("../../middleware/auth");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const result = await favoritesService_1.default.getFavorites(req.userId, page, limit);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Get favorites error:', error);
        res.status(500).json({ error: 'Failed to get favorites' });
    }
});
router.post('/', async (req, res) => {
    try {
        const product = req.body;
        // Валидация
        if (!product.id || typeof product.id !== 'string') {
            return res.status(400).json({ error: 'Valid product id is required' });
        }
        if (!product.marketplace || typeof product.marketplace !== 'string') {
            return res.status(400).json({ error: 'Valid marketplace is required' });
        }
        if (!product.name || typeof product.name !== 'string') {
            return res.status(400).json({ error: 'Valid product name is required' });
        }
        if (typeof product.price !== 'number' || product.price < 0) {
            return res.status(400).json({ error: 'Valid product price is required' });
        }
        const favorite = await favoritesService_1.default.addFavorite(req.userId, product);
        res.json({ favorite });
    }
    catch (error) {
        logger_1.default.error('Add favorite error:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});
router.delete('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const success = await favoritesService_1.default.removeFavorite(req.userId, productId);
        if (success) {
            res.json({ message: 'Removed from favorites' });
        }
        else {
            res.status(404).json({ error: 'Favorite not found' });
        }
    }
    catch (error) {
        logger_1.default.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});
router.get('/check/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const isFavorite = await favoritesService_1.default.isFavorite(req.userId, productId);
        res.json({ isFavorite });
    }
    catch (error) {
        logger_1.default.error('Check favorite error:', error);
        res.status(500).json({ error: 'Failed to check favorite' });
    }
});
exports.default = router;
