import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role?: string;
      };
      anomalyScore?: {
        score: number;
        anomalies: string[];
        risk: string;
        shouldBlock: boolean;
      };
      threatScore?: {
        score: number;
        reasons: string[];
        blocked: boolean;
      };
    }
  }
}

export {};
