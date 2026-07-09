import { logger } from '../utils/logger';

export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    public readonly name: string,
    private failureThreshold: number = 3,
    private resetTimeoutMs: number = 60000
  ) {}

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        logger.info(`Circuit breaker [${this.name}] changing from OPEN to HALF_OPEN`);
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Action blocked.`);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      logger.info(`Circuit breaker [${this.name}] changing from HALF_OPEN to CLOSED`);
      this.state = 'CLOSED';
    }
  }

  private onFailure(error: any) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    logger.warn(`Circuit breaker [${this.name}] failure (${this.failureCount}/${this.failureThreshold}): ${error.message}`);
    
    if (this.failureCount >= this.failureThreshold) {
      if (this.state !== 'OPEN') {
        logger.error(`Circuit breaker [${this.name}] tripped! Changing to OPEN state.`);
        this.state = 'OPEN';
      }
    }
  }

  public getStatus() {
    return this.state;
  }
}
