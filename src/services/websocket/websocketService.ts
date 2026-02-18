import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import env from '../../config/env';
import logger from '../../utils/logger';

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<number, Set<string>> = new Map();
  private pubsub: any = null;

  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: env.FRONTEND_URL,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    logger.info('WebSocket server initialized');
  }

  setPubSub(pubsub: any): void {
    this.pubsub = pubsub;
  }

  private authenticateSocket(socket: any, next: any): void {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; email: string };
      socket.userId = decoded.userId;
      socket.email = decoded.email;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  }

  private handleConnection(socket: any): void {
    const userId = socket.userId;
    logger.info(`User ${userId} connected via WebSocket`);

    // Track connected users
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle price alert subscription
    socket.on('subscribe:price-alerts', () => {
      socket.join(`price-alerts:${userId}`);
      logger.info(`User ${userId} subscribed to price alerts`);
    });

    // Handle product tracking
    socket.on('track:product', (productId: string) => {
      socket.join(`product:${productId}`);
      logger.info(`User ${userId} tracking product ${productId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`User ${userId} disconnected`);
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to SmartPrice WebSocket',
      userId,
    });
  }

  // Send price alert to user
  sendPriceAlert(userId: number, alert: any): void {
    if (!this.io) return;
    
    this.io.to(`price-alerts:${userId}`).emit('price-alert', alert);
    
    // Publish to GraphQL subscriptions
    if (this.pubsub) {
      this.pubsub.publish(`PRICE_ALERT_${userId}`, { priceAlertTriggered: alert });
    }
    
    logger.info(`Price alert sent to user ${userId}`);
  }

  // Send product update
  sendProductUpdate(productId: string, update: any): void {
    if (!this.io) return;
    
    this.io.to(`product:${productId}`).emit('product-update', update);
    
    // Publish to GraphQL subscriptions
    if (this.pubsub) {
      this.pubsub.publish(`PRODUCT_UPDATE_${productId}`, { productUpdated: update });
    }
    
    logger.info(`Product update sent for ${productId}`);
  }

  // Broadcast to all users
  broadcast(event: string, data: any): void {
    if (!this.io) return;
    
    this.io.emit(event, data);
    logger.info(`Broadcast event: ${event}`);
  }

  // Send to specific user
  sendToUser(userId: number, event: string, data: any): void {
    if (!this.io) return;
    
    this.io.to(`user:${userId}`).emit(event, data);
    logger.info(`Event ${event} sent to user ${userId}`);
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Check if user is connected
  isUserConnected(userId: number): boolean {
    return this.connectedUsers.has(userId);
  }
}

export const websocketService = new WebSocketService();
export default websocketService;
