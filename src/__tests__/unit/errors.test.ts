/**
 * Unit Tests for Error Handling
 */

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  SecurityError,
  ServiceUnavailableError,
} from '../../utils/errors';
import { HTTP_STATUS, ERROR_CODES } from '../../config/constants';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with correct properties', () => {
      const error = new AppError('Test error', 500, 'TEST_CODE');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('AppError');
    });

    it('should use default values', () => {
      const error = new AppError('Test error');
      
      expect(error.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(error.name).toBe('ValidationError');
    });

    it('should include details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new ValidationError('Invalid input', details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid token');
      
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError();
      
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
      expect(error.name).toBe('AuthorizationError');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError();
      
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError();
      
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(error.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED);
      expect(error.name).toBe('RateLimitError');
    });

    it('should include retry after', () => {
      const error = new RateLimitError('Too many requests', 60);
      
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('SecurityError', () => {
    it('should create security error', () => {
      const error = new SecurityError('SQL injection detected', 'SQL_INJECTION');
      
      expect(error.message).toBe('SQL injection detected');
      expect(error.code).toBe('SQL_INJECTION');
      expect(error.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
      expect(error.name).toBe('SecurityError');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError();
      
      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.statusCode).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(error.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(error.name).toBe('ServiceUnavailableError');
    });
  });
});
