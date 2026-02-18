import { Request, Response, NextFunction } from 'express';

export function cachingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    if (req.path.startsWith('/api/search') || req.path.startsWith('/api/suggestions')) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    } else if (req.path.startsWith('/api/favorites') || req.path.startsWith('/api/sessions')) {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    } else if (req.path.startsWith('/api/price-history')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
  next();
}
