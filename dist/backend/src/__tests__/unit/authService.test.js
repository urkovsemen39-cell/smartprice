"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const authService_1 = __importDefault(require("../../services/auth/authService"));
// Мокаем базу данных
jest.mock('../../config/database', () => ({
    query: jest.fn(),
}));
// Мокаем email сервис
jest.mock('../../services/email/emailService', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));
const database_1 = __importDefault(require("../../config/database"));
describe('AuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('register', () => {
        it('should register a new user successfully', async () => {
            const mockUser = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                created_at: new Date(),
            };
            database_1.default.query
                .mockResolvedValueOnce({ rows: [] }) // Проверка существования
                .mockResolvedValueOnce({ rows: [mockUser] }); // Создание пользователя
            const result = await authService_1.default.register('test@example.com', 'password123', 'Test User');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('user');
            expect(result.user.email).toBe('test@example.com');
        });
        it('should throw error for invalid email', async () => {
            await expect(authService_1.default.register('invalid-email', 'password123')).rejects.toThrow('Invalid email format');
        });
        it('should throw error for short password', async () => {
            await expect(authService_1.default.register('test@example.com', 'short')).rejects.toThrow('Password must be at least 8 characters');
        });
        it('should throw error for existing user', async () => {
            database_1.default.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
            await expect(authService_1.default.register('test@example.com', 'password123')).rejects.toThrow('User with this email already exists');
        });
    });
    describe('login', () => {
        it('should login user successfully', async () => {
            const mockUser = {
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWEHtXem', // "password123"
                created_at: new Date(),
            };
            database_1.default.query.mockResolvedValueOnce({ rows: [mockUser] });
            const result = await authService_1.default.login('test@example.com', 'password123');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('user');
        });
        it('should throw error for non-existent user', async () => {
            database_1.default.query.mockResolvedValueOnce({ rows: [] });
            await expect(authService_1.default.login('test@example.com', 'password123')).rejects.toThrow('Invalid email or password');
        });
    });
    describe('verifyToken', () => {
        it('should verify valid token', () => {
            const token = authService_1.default['generateToken'](1);
            const decoded = authService_1.default.verifyToken(token);
            expect(decoded).toHaveProperty('userId', 1);
        });
        it('should return null for invalid token', () => {
            const decoded = authService_1.default.verifyToken('invalid-token');
            expect(decoded).toBeNull();
        });
    });
});
