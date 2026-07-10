import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface QueueMessage {
  id?: string;
  type?: 'MARKET_TICK' | 'SIGNAL_AI_VALIDATION' | 'SIGNAL_NOTIFICATION' | 'STRATEGY_TRANSITION' | 'SIGNAL_PUBLISHED' | 'SIGNAL_ARCHIVED' | string;
  payload?: any;
  timestamp?: string;
  retryCount?: number;
  [key: string]: any;
}

export class QueueManager {
  private connected: boolean = false;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private client: Redis | null = null;
  private localEmitter = new EventEmitter();
  private useRedis: boolean = false;

  constructor() {
    // We defer actual Redis instantiation until connect() is called
    // to strictly enforce lazy initialization.
    this.useRedis = !!getEnv("REDIS_URL");
  }

  private setupListeners() {
    if (!this.useRedis || !this.client || !this.publisher || !this.subscriber) return;
    const handleError = (type: string) => (err: Error) => {
      logger.error(`Redis ${type} error: ${err.message}`);
      this.connected = false;
    };
    
    this.publisher.on('error', handleError('publisher'));
    this.subscriber.on('error', handleError('subscriber'));
    this.client.on('error', handleError('client'));
    
    this.client.on('connect', () => {
      this.connected = true;
      logger.info('Queue Manager connected to Redis');
    });
  }

  public isConnected() {
    return this.connected;
  }

  async connect() {
    if (this.connected) return; // already connected

    const redisUrl = getEnv("REDIS_URL");
    if (redisUrl) {
      this.useRedis = true;
      if (!this.publisher) {
        const redisOpts = { 
          lazyConnect: true, 
          maxRetriesPerRequest: 1, 
          retryStrategy: (times: number) => Math.min(times * 1000, 5000) 
        };
        this.publisher = new Redis(redisUrl, redisOpts);
        this.subscriber = new Redis(redisUrl, redisOpts);
        this.client = new Redis(redisUrl, redisOpts);
        this.setupListeners();
      }
    } else {
      logger.info('REDIS_URL not provided, falling back to in-memory queue.');
      this.connected = true;
      return;
    }

    try {
      await Promise.all([
        this.publisher!.connect().catch(() => {}),
        this.subscriber!.connect().catch(() => {}),
        this.client!.connect().catch(() => {})
      ]);
      this.connected = true;
    } catch (err: any) {
      logger.warn(`Queue Manager cannot connect to Redis: ${err.message}`);
    }
  }

  async publish(topic: string, message: QueueMessage): Promise<boolean> {
    if (this.useRedis && !this.connected) {
      await this.connect();
    }
    
    logger.debug(`Publishing message to ${topic}`, { messageId: message.id });
    
    if (!this.useRedis || !this.connected) {
      if (this.useRedis && !this.connected) {
         logger.warn('Not connected to Redis Queue, falling back to local emitter');
      }
      this.localEmitter.emit(`queue:${topic}`, message);
      return true;
    }

    try {
      await this.publisher!.publish(`queue:${topic}`, JSON.stringify(message));
      return true;
    } catch (err: any) {
      logger.error(`Failed to publish message: ${err.message}`);
      return false;
    }
  }

  async subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>) {
    if (this.useRedis && !this.connected) {
      await this.connect();
    }
    
    logger.info(`Subscribed to ${topic}`);
    
    if (!this.useRedis || !this.connected) {
      if (this.useRedis && !this.connected) {
         logger.warn('Not connected to Redis Queue, falling back to local emitter');
      }
      const listener = async (message: QueueMessage) => {
        try {
          await handler(message);
        } catch (err: any) {
          logger.error(`Error processing message from ${topic}: ${err.message}`);
        }
      };
      (handler as any)._localListener = listener;
      this.localEmitter.on(`queue:${topic}`, listener);
      return;
    }

    try {
      await this.subscriber!.subscribe(`queue:${topic}`);
      
      const listener = async (channel: string, messageStr: string) => {
        if (channel === `queue:${topic}`) {
          try {
            const message = JSON.parse(messageStr) as QueueMessage;
            await handler(message);
          } catch (err: any) {
            logger.error(`Error processing message from ${topic}: ${err.message}`);
          }
        }
      };
      
      (handler as any)._redisListener = listener;
      this.subscriber!.on('message', listener);
    } catch (err: any) {
      logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
    }
  }

  async unsubscribe(topic: string, handler: (message: QueueMessage) => Promise<void>) {
    if (!this.connected) return;
    
    if (!this.useRedis) {
      const listener = (handler as any)._localListener;
      if (listener) {
        this.localEmitter.off(`queue:${topic}`, listener);
        delete (handler as any)._localListener;
      }
      return;
    }

    const listener = (handler as any)._redisListener;
    if (listener) {
      logger.debug(`Unsubscribing from ${topic}`);
      this.subscriber!.off('message', listener);
      delete (handler as any)._redisListener;
    }
  }
  
  // Distributed Lock Implementation
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    if (!this.useRedis || !this.connected) return true; // Fallback allow if no redis
    try {
      const result = await this.client!.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err: any) {
      logger.error(`Failed to acquire lock for ${key}: ${err.message}`);
      return true; // fail-open
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.useRedis || !this.connected) return;
    try {
      await this.client!.del(`lock:${key}`);
    } catch (err: any) {
      logger.error(`Failed to release lock for ${key}: ${err.message}`);
    }
  }
}

let _queueManager: QueueManager | null = null;
export function getQueueManager(): QueueManager {
  if (!_queueManager) _queueManager = new QueueManager();
  return _queueManager;
}

