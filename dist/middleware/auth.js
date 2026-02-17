"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
const authService_1 = __importDefault(require("../services/auth/authService"));
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.substring(7);
        const decoded = authService_1.default.verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.userId = decoded.userId;
        next();
    }
    catch (error) {
        console.error('❌ Auth middleware error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}
async function optionalAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = authService_1.default.verifyToken(token);
            if (decoded) {
                req.userId = decoded.userId;
            }
        }
        next();
    }
    catch (error) {
        console.error('❌ Optional auth middleware error:', error);
        next();
    }
}
// Alias for compatibility
exports.authenticateToken = authMiddleware;
