import request from 'supertest';
import express from 'express';
import authRoutes from '../../api/routes/auth';
import searchRoutes from '../../api/routes/search';

// Мокаем зависимости
jest.mock('../../config/database');
jest.mock('../../config/redis');
jest.mock('../../services/email/emailService');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);

describe('API Integration Tests', () => {
  describe('POST /api/auth/register', () => {
    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('8 characters');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/search', () => {
    it('should return 400 for missing query', async () => {
      const response = await request(app).get('/api/search');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 for too long query', async () => {
      const longQuery = 'a'.repeat(201);
      const response = await request(app).get(`/api/search?q=${longQuery}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('too long');
    });
  });
});
