/**
 * Standardized Error Handling
 * Единая система обработки ошибок с кодами и типизацией
 */

import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import logger from './logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    public code: string = ERROR_CODES.INTERNAL_ERROR,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_INPUT, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', code: string = ERROR_CODES.TOKEN_INVALID) {
    super(message, HTTP_STATUS.UNAUTHORIZED, code);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.INVALID_CREDENTIALS);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.INVALID_INPUT);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class SecurityError extends AppError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, HTTP_STATUS.FORBIDDEN, code, details);
    this.name = 'SecurityError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, ERROR_CODES.SERVICE_UNAVAILABLE);
    this.name = 'ServiceUnavailableError';
  }
}

interface ErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
  stack?: string;
}

export function handleError(error: unknown, res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // Type guard for Error objects
  const err = error instanceof Error ? error : new Error(String(error));
  const appError = error instanceof AppError ? error : null;

  // Log error
  logger.error('Error occurred', {
    name: err.name,
    message: err.message,
    code: appError?.code,
    stack: !isProduction ? err.stack : undefined,
  });

  // Default error response
  let response: ErrorResponse = {
    error: 'Internal server error',
    code: ERROR_CODES.INTERNAL_ERROR,
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  };

  // Handle known errors
  if (appError) {
    response = {
      error: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
      details: appError.details,
    };
  } else if (err.name === 'ValidationError') {
    response = {
      error: err.message,
      code: ERROR_CODES.INVALID_INPUT,
      statusCode: HTTP_STATUS.BAD_REQUEST,
    };
  } else if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
    response = {
      error: 'Service temporarily unavailable',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
    };
  } else if ((error as { code?: string }).code === '23505') { // PostgreSQL unique violation
    response = {
      error: 'Resource already exists',
      code: ERROR_CODES.INVALID_INPUT,
      statusCode: HTTP_STATUS.CONFLICT,
    };
  } else if ((error as { code?: string }).code === '23503') { // PostgreSQL foreign key violation
    response = {
      error: 'Referenced resource not found',
      code: ERROR_CODES.INVALID_INPUT,
      statusCode: HTTP_STATUS.BAD_REQUEST,
    };
  }

  // Include stack trace in development
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(response.statusCode).json(response);
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  SecurityError,
  ServiceUnavailableError,
  handleError,
  asyncHandler,
};
