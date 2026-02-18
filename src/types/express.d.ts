// Расширение типов Express для совместимости с AuthRequest
import { Request } from 'express';

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      emailVerified: boolean;
      role: string;
    }
    
    interface Request {
      userId?: number;
      user?: User;
    }
  }
}
