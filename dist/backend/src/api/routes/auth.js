"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService_1 = __importDefault(require("../../services/auth/authService"));
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        // Валидация
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Valid password is required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (password.length > 100) {
            return res.status(400).json({ error: 'Password is too long (max 100 characters)' });
        }
        if (name && typeof name !== 'string') {
            return res.status(400).json({ error: 'Name must be a string' });
        }
        if (name && name.length > 255) {
            return res.status(400).json({ error: 'Name is too long (max 255 characters)' });
        }
        // Простая валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        const result = await authService_1.default.register(email, password, name);
        res.json(result);
    }
    catch (error) {
        console.error('❌ Register error:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Registration failed'
        });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Валидация
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Valid password is required' });
        }
        const result = await authService_1.default.login(email, password);
        res.json(result);
    }
    catch (error) {
        console.error('❌ Login error:', error);
        res.status(401).json({
            error: error instanceof Error ? error.message : 'Login failed'
        });
    }
});
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await authService_1.default.getUserById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});
exports.default = router;
