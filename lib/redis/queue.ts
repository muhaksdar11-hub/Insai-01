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
  
  private redisFailures: number = 0;
  private circuitOpen: boolean = false;
  private readonly maxFailures = 5;

  private redisListeners = new Map<string, Array<{ handler: (msg: QueueMessage) => Promise<void>, wrapped: (channel: string, msg: string) => void }>>();

  constructor() {
    this.useRedis = !!getEnv("REDIS_URL");
    this.localEmitter.setMaxListeners(100);
  }

  private setupListeners() {
    if (!this.useRedis || !this.client || !this.publisher || !this.subscriber) return;
    const handleError = (type: string) => (err: Error) => {
      this.connected = false;
      this.redisFailures++;
      if (this.redisFailures >= this.maxFailures && !this.circuitOpen) {
        this.circuitOpen = true;
        logger.error(`Redis circuit breaker opened after ${this.redisFailures} failures`);
        setTimeout(() => {
           this.circuitOpen = false;
           this.redisFailures = 0;
           logger.info(`Redis circuit breaker half-open`);
        }, 30000);
      }
      if (err.message.includes('ECONNREFUSED')) return;
      logger.error(`Redis ${type} error: ${err.message}`);
    };
    
    this.publisher.on('error', handleError('publisher'));
    this.subscriber.on('error', handleError('subscriber'));
    this.client.on('error', handleError('client'));
    
    this.client.on('connect', () => {
      this.connected = true;
      this.redisFailures = 0;
      this.circuitOpen = false;
      logger.info('Queue Manager connected to Redis');
    });
  }

  public isConnected() {
    return this.useRedis && this.connected && !this.circuitOpen;
  }

  async connect() {
    if (this.connected) return;

    const redisUrl = getEnv("REDIS_URL");
    if (redisUrl) {
      this.useRedis = true;
      if (!this.publisher) {
        const redisOpts = { 
          lazyConnect: true, 
          enableOfflineQueue: false, // Don't buffer indefinitely
          maxRetriesPerRequest: 3, 
          retryStrategy: (times: number) => Math.min(Math.pow(2, times) * 100, 10000) 
        };
        this.publisher = new Redis(redisUrl, redisOpts);
        this.subscriber = new Redis(redisUrl, redisOpts);
        this.client = new Redis(redisUrl, redisOpts);
        this.setupListeners();
      }
    } else {
      logger.warn('REDIS_URL not provided. Running in degraded local-only mode. Distributed features will fail.');
      this.connected = false; // Cannot pretend to be connected
      return;
    }

    try {
      await Promise.all([
        this.publisher!.connect().catch(() => {}),
        this.subscriber!.connect().catch(() => {}),
        this.client!.connect().catch(() => {})
      ]);
      if (this.publisher!.status === "ready" || this.client!.status === "ready") {
        this.connected = true;
      }
    } catch (err: any) {
      logger.error(`Queue Manager cannot connect to Redis: ${err.message}`);
    }
  }

  async publish(topic: string, message: QueueMessage): Promise<boolean> {
    if (this.useRedis && !this.connected && !this.circuitOpen) {
      await this.connect();
    }
    
    if (!this.useRedis) {
      this.localEmitter.emit(`queue:${topic}`, message);
      return true;
    }

    if (this.circuitOpen || !this.publisher || this.publisher.status !== 'ready') {
      logger.warn(`Cannot publish to ${topic}: Redis circuit open or unconfigured`);
      return false;
    }

    try {
      await Promise.race([
         this.publisher.publish(`queue:${topic}`, JSON.stringify(message)),
         new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 2000))
      ]);
      return true;
    } catch (err: any) {
      logger.error(`Failed to publish message: ${err.message}`);
      return false;
    }
  }

  async subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>) {
    if (this.useRedis && !this.connected && !this.circuitOpen) {
      await this.connect();
    }
    
    if (!this.useRedis) {
      const listener = async (message: QueueMessage) => {
        try { await handler(message); } catch (err: any) { logger.error(err.message); }
      };
      (handler as any)._localListener = listener;
      this.localEmitter.on(`queue:${topic}`, listener);
      return;
    }

    if (!this.subscriber || this.circuitOpen || this.subscriber.status !== 'ready') return;

    try {
      await this.subscriber.subscribe(`queue:${topic}`);
      
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
      
      let topicListeners = this.redisListeners.get(topic);
      if (!topicListeners) {
        topicListeners = [];
        this.redisListeners.set(topic, topicListeners);
      }
      topicListeners.push({ handler, wrapped: listener });
      this.subscriber.on('message', listener);
      logger.debug(`Subscribed to Redis topic: ${topic}`);
    } catch (err: any) {
      logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
    }
  }

  async unsubscribe(topic: string, handler: (message: QueueMessage) => Promise<void>) {
    if (!this.useRedis) {
      const listener = (handler as any)._localListener;
      if (listener) {
        this.localEmitter.off(`queue:${topic}`, listener);
        delete (handler as any)._localListener;
      }
      return;
    }

    if (this.subscriber) {
       let topicListeners = this.redisListeners.get(topic);
       if (topicListeners) {
          const idx = topicListeners.findIndex(l => l.handler === handler);
          if (idx !== -1) {
             const listener = topicListeners[idx].wrapped;
             this.subscriber.off('message', listener);
             topicListeners.splice(idx, 1);
             if (topicListeners.length === 0 && this.subscriber.status === 'ready') {
                await this.subscriber.unsubscribe(`queue:${topic}`).catch(() => {});
                this.redisListeners.delete(topic);
             }
          }
       }
    }
  }

  async close() {
    this.connected = false;
    this.localEmitter.removeAllListeners();
    this.redisListeners.clear();
    const closePromises = [];
    if (this.publisher) {
      closePromises.push(this.publisher.quit().catch(() => this.publisher?.disconnect()));
    }
    if (this.subscriber) {
      closePromises.push(this.subscriber.quit().catch(() => this.subscriber?.disconnect()));
    }
    if (this.client) {
      closePromises.push(this.client.quit().catch(() => this.client?.disconnect()));
    }
    await Promise.allSettled(closePromises);
    logger.info('Queue Manager disconnected from Redis and cleaned up listeners.');
  }
  
  async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') return;
    try {
      await Promise.race([
         this.client.set(`cache:${key}`, JSON.stringify(value), 'EX', ttlSeconds),
         new Promise((_, reject) => setTimeout(() => reject(new Error('Cache timeout')), 1000))
      ]);
    } catch (err: any) {
      logger.error(`Failed to set cache for ${key}: ${err.message}`);
    }
  }

  async getCache<T>(key: string): Promise<T | null> {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') return null;
    try {
      const result = await Promise.race([
          this.client.get(`cache:${key}`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cache timeout')), 1000))
      ]) as string | null;
      
      if (result) {
        return JSON.parse(result) as T;
      }
      return null;
    } catch (err: any) {
      logger.error(`Failed to get cache for ${key}: ${err.message}`);
      return null;
    }
  }
  
  private localLocks = new Map<string, number>();

  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') {
       const now = Date.now();
       const existing = this.localLocks.get(key);
       if (existing && existing > now) return false;
       this.localLocks.set(key, now + ttlSeconds * 1000);
       return true;
    }
    try {
      const result = await Promise.race([
          this.client.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 1000))
      ]);
      return result === 'OK';
    } catch (err: any) {
      logger.error(`Failed to acquire lock for ${key}: ${err.message}`);
      return false; // fail-close on error
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') {
       this.localLocks.delete(key);
       return;
    }
    try {
      await Promise.race([
         this.client.del(`lock:${key}`),
         new Promise((_, reject) => setTimeout(() => reject(new Error('Unlock timeout')), 1000))
      ]);
    } catch (err: any) {
      logger.error(`Failed to release lock for ${key}: ${err.message}`);
    }
  }

  async deduplicate(key: string, ttlSeconds: number = 60): Promise<boolean> {
    return this.acquireLock(`dedup:${key}`, ttlSeconds);
  }

  async streamPublish(stream: string, message: QueueMessage, maxLen: number = 1000): Promise<string | null> {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') return null;
    try {
      const id = await this.client.xadd(
        stream,
        'MAXLEN', '~', maxLen.toString(),
        '*',
        'payload', JSON.stringify(message)
      );
      return id;
    } catch (err: any) {
      logger.error(`Failed to XADD to stream ${stream}: ${err.message}`);
      return null;
    }
  }

  async streamSubscribeGroup(stream: string, group: string, consumer: string, handler: (message: QueueMessage, msgId: string) => Promise<void>) {
    if (!this.useRedis || !this.client || this.circuitOpen || this.client.status !== 'ready') {
       logger.warn('Redis Streams require an active Redis connection.');
       return;
    }
    
    // Create group if not exists
    try {
      await this.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        logger.error(`Failed to create group ${group} on ${stream}: ${err.message}`);
        return;
      }
    }

    const poll = async () => {
      if (!this.connected || this.circuitOpen) {
          setTimeout(poll, 5000);
          return;
      }
      try {
        const results = await (this.client as any).xreadgroup(
          'GROUP', group, consumer,
          'BLOCK', 5000,
          'COUNT', 10,
          'STREAMS', stream, '>'
        ) as any;

        if (results && results.length > 0) {
          for (const result of results) {
             const [_streamName, messages] = result;
             for (const msg of messages) {
                const [id, fields] = msg;
                let payloadStr = '';
                for(let i = 0; i < fields.length; i+=2) {
                   if (fields[i] === 'payload') payloadStr = fields[i+1];
                }
                
                if (payloadStr) {
                   try {
                     const parsed = JSON.parse(payloadStr) as QueueMessage;
                     await handler(parsed, id);
                     await this.client!.xack(stream, group, id);
                   } catch (e: any) {
                     logger.error(`Failed to process stream message ${id}: ${e.message}`);
                   }
                }
             }
          }
        }
      } catch (e: any) {
        logger.error(`XREADGROUP error on ${stream}: ${e.message}`);
      }
      setTimeout(poll, 100);
    };
    
    poll();
}
}

let _queueManager: QueueManager | null = null;
export function getQueueManager(): QueueManager {
  if (!_queueManager) _queueManager = new QueueManager();
  return _queueManager;
}
