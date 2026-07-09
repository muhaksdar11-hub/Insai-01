import { logger } from './logger';

export class IdempotencyManager {
  
  private processedKeys: Set<string> = new Set();

  public async isProcessed(key: string): Promise<boolean> {
    return this.processedKeys.has(key);
  }

  public async markProcessed(key: string, ttlSeconds: number = 3600): Promise<void> {
    this.processedKeys.add(key);
    
    setTimeout(() => {
      this.processedKeys.delete(key);
    }, ttlSeconds * 1000);
    logger.debug(`Marked key as processed: ${key}`);
  }

  public async executeIdempotent<T>(
    key: string, 
    operation: () => Promise<T>, 
    ttlSeconds: number = 3600
  ): Promise<T | null> {
    if (await this.isProcessed(key)) {
      logger.info(`Skipping duplicate operation for key: ${key}`);
      return null;
    }
    
    try {
      const result = await operation();
      await this.markProcessed(key, ttlSeconds);
      return result;
    } catch (error) {
      // Do not mark as processed if it fails, allow retry
      throw error;
    }
  }
}

export const idempotency = new IdempotencyManager();
