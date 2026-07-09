import { ProviderHealth, HealthStatus } from '@/types';
import { logger } from '../utils/logger';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class ProviderRegistry {
  private healthMap: Map<string, ProviderHealth & { failures: number, lastFailureTime: number }> = new Map();
  private cbConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    resetTimeoutMs: 30000 // 30 seconds
  };

  constructor() {
    this.registerProvider('TwelveData', 'price', 'not configured');
    this.registerProvider('YahooFinance', 'price', 'healthy');
    this.registerProvider('NewsAPI', 'news', 'not configured');
    this.registerProvider('ForexFactory', 'calendar', 'healthy');
    this.registerProvider('Twitter', 'sentiment', 'not configured');
    this.registerProvider('GeminiAI', 'ai', 'not configured');
  }

  private registerProvider(name: string, category: ProviderHealth['category'], initialStatus: HealthStatus | 'not configured') {
    this.healthMap.set(name, {
      providerName: name,
      category,
      healthStatus: initialStatus === 'not configured' ? 'unavailable' : initialStatus,
      lastSuccessAt: null,
      lastError: initialStatus === 'not configured' ? 'Not configured' : null,
      circuitBreakerStatus: 'closed',
      failures: 0,
      lastFailureTime: 0
    });
  }

  public reportSuccess(providerName: string) {
    const provider = this.healthMap.get(providerName);
    if (provider) {
      provider.healthStatus = 'healthy';
      provider.lastSuccessAt = new Date().toISOString();
      provider.lastError = null;
      provider.circuitBreakerStatus = 'closed';
      provider.failures = 0;
      this.healthMap.set(providerName, provider);
    }
  }

  public reportError(providerName: string, error: string) {
    const provider = this.healthMap.get(providerName);
    if (provider) {
      provider.healthStatus = 'error';
      provider.lastError = error;
      
      provider.failures += 1;
      provider.lastFailureTime = Date.now();
      
      if (provider.failures >= this.cbConfig.failureThreshold) {
        provider.circuitBreakerStatus = 'open';
        logger.error(`Circuit breaker opened for provider [${providerName}] due to consecutive failures.`);
      }

      this.healthMap.set(providerName, provider);
      logger.error(`Provider error [${providerName}]: ${error}`);
    }
  }

  public getProviderHealth(providerName: string): ProviderHealth | undefined {
    const provider = this.healthMap.get(providerName);
    if (!provider) return undefined;

    // Check if circuit breaker can transition to half_open
    if (provider.circuitBreakerStatus === 'open') {
      const now = Date.now();
      if (now - provider.lastFailureTime > this.cbConfig.resetTimeoutMs) {
        provider.circuitBreakerStatus = 'half_open';
        this.healthMap.set(providerName, provider);
        logger.info(`Circuit breaker half-open for provider [${providerName}]. Testing next request.`);
      }
    }

    return provider;
  }

  public getAllHealth(): ProviderHealth[] {
    // Update state before returning
    const names = Array.from(this.healthMap.keys());
    for (const name of names) {
      this.getProviderHealth(name);
    }
    
    return Array.from(this.healthMap.values()).map(p => {
      const { failures, lastFailureTime, ...rest } = p;
      return rest;
    });
  }

  public isHealthy(providerName: string): boolean {
    const health = this.getProviderHealth(providerName);
    return health?.healthStatus === 'healthy' && health?.circuitBreakerStatus === 'closed';
  }
}

let _providerRegistry: ProviderRegistry | null = null;
export function getProviderRegistry(): ProviderRegistry {
  if (!_providerRegistry) _providerRegistry = new ProviderRegistry();
  return _providerRegistry;
}
