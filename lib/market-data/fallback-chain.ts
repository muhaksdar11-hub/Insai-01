import { getProviderRegistry } from './provider-registry';
import { logger } from '../utils/logger';

export class FallbackChain<T> {
  private providers: { provider: T; name: string }[] = [];

  addProvider(provider: T, name: string) {
    this.providers.push({ provider, name });
  }

  async execute<R>(
    operation: (provider: T) => Promise<R>,
    context: string,
    fallbackValue?: R
  ): Promise<R> {
    const errors: Error[] = [];
    for (const { provider, name } of this.providers) {
      if (getProviderRegistry().getProviderHealth(name)?.healthStatus === 'error') {
        const health = getProviderRegistry().getProviderHealth(name);
        if (health?.circuitBreakerStatus === 'open') {
           logger.warn(`Skipping provider ${name} due to open circuit breaker for ${context}`);
           errors.push(new Error(`Provider ${name} skipped: circuit breaker open`));
           continue;
        }
      }

      try {
        const result = await operation(provider);
        return result;
      } catch (error: any) {
        if (error.message.includes('not configured')) {
          logger.warn(`Provider ${name} skipped for ${context}: ${error.message}`);
        } else {
          logger.error(`Provider ${name} failed for ${context}: ${error.message}`);
        }
        errors.push(error);
        if (!error.message.includes('not configured')) {
          logger.warn(`Falling back to next provider for ${context}...`);
        }
      }
    }

    const errorMessage = errors.length > 0 
      ? errors.map(e => e.message).join(', ')
      : `No available providers for ${context}`;

    if (errorMessage.includes('not configured')) {
      logger.warn(`All providers skipped for ${context}. Reason: ${errorMessage}`);
    } else {
      logger.error(`All providers failed for ${context}. Errors: ${errorMessage}`);
    }
    
    if (fallbackValue !== undefined) {
      if (typeof fallbackValue === 'object' && fallbackValue !== null) {
        (fallbackValue as any).reason = errorMessage;
        
        if (errorMessage.includes('Rate Limited') || errorMessage.includes('429')) {
          (fallbackValue as any).status = 'rate_limited';
        } else if (errorMessage.includes('Unavailable')) {
          (fallbackValue as any).status = 'provider_unavailable';
        } else if (!errorMessage.includes('not configured')) {
          (fallbackValue as any).status = 'error';
        }
      }
      return fallbackValue;
    }
    
    throw new Error(`Market Data Error (${context}): ${errorMessage}`);
  }
}
