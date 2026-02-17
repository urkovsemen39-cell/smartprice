import authService from '../../services/auth/authService';

// Мокаем базу данных
jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

// Мокаем email сервис
jest.mock('../../services/email/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));

import db from '../../config/database';

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

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Проверка существования
        .mockResolvedValueOnce({ rows: [mockUser] }); // Создание пользователя

      const result = await authService.register('test@example.com', 'password123', 'Test User');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error for invalid email', async () => {
      await expect(
        authService.register('invalid-email', 'password123')
      ).rejects.toThrow('Invalid email format');
    });

    it('should throw error for short password', async () => {
      await expect(
        authService.register('test@example.com', 'short')
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('should throw error for existing user', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await expect(
        authService.register('test@example.com', 'password123')
      ).rejects.toThrow('User with this email already exists');
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

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
    });

    it('should throw error for non-existent user', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        authService.login('test@example.com', 'password123')
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = authService['generateToken'](1);
      const decoded = authService.verifyToken(token);

      expect(decoded).toHaveProperty('userId', 1);
    });

    it('should return null for invalid token', () => {
      const decoded = authService.verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });
});
