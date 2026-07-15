import { ProviderHealth, HealthStatus } from '@/types';
import { logger } from '../utils/logger';
import { getMcpRegistry } from '../mcp/registry';

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
    this.registerProvider('Polygon.io', 'price', 'NOT CONFIGURED');
    this.registerProvider('TwelveData', 'price', 'NOT CONFIGURED');
    this.registerProvider('YahooFinance', 'price', 'ONLINE');
    this.registerProvider('NewsAPI', 'news', 'NOT CONFIGURED');
    this.registerProvider('ForexFactory', 'calendar', 'ONLINE');
    this.registerProvider('Twitter Bearer', 'news', 'NOT CONFIGURED');
    this.registerProvider('GeminiAI', 'ai', 'NOT CONFIGURED');
  }

  private registerProvider(name: string, category: ProviderHealth['category'], initialStatus: HealthStatus) {
    this.healthMap.set(name, {
      providerName: name,
      category,
      healthStatus: initialStatus,
      lastSuccessAt: null,
      lastError: initialStatus === 'NOT CONFIGURED' ? 'Not configured' : null,
      circuitBreakerStatus: 'closed',
      failures: 0,
      lastFailureTime: 0
    });
  }

  public reportSuccess(providerName: string) {
    const provider = this.healthMap.get(providerName);
    if (provider) {
      // Only sync if status changed to prevent spamming DB
      const wasError = provider.healthStatus !== 'ONLINE';
      
      provider.healthStatus = 'ONLINE';
      provider.lastSuccessAt = new Date().toISOString();
      provider.lastError = null;
      provider.circuitBreakerStatus = 'closed';
      provider.failures = 0;
      this.healthMap.set(providerName, provider);
      
      if (wasError) {
         getMcpRegistry().reportConnected(providerName).catch(() => {});
      }
    }
  }

  public reportError(providerName: string, error: string) {
    const provider = this.healthMap.get(providerName);
    if (provider) {
      provider.healthStatus = 'UNAVAILABLE';
      provider.lastError = error;
      
      const isRateLimited = error && (error.includes('429') || error.toLowerCase().includes('rate limit') || error.toLowerCase().includes('quota') || error.toLowerCase().includes('exhausted'));
      
      if (isRateLimited) {
        provider.failures = this.cbConfig.failureThreshold; // instantly open circuit breaker
        provider.healthStatus = 'RATE LIMITED';
      } else {
        provider.failures += 1;
      }
      
      provider.lastFailureTime = Date.now();
      
      if (provider.failures >= this.cbConfig.failureThreshold) {
        provider.circuitBreakerStatus = 'open';
        if (isRateLimited) {
           provider.lastFailureTime = Date.now() + 5 * 60 * 1000 - this.cbConfig.resetTimeoutMs;
           logger.error(`Circuit breaker opened (RATE LIMITED) for provider [${providerName}] for 5 minutes.`);
        } else {
           logger.error(`Circuit breaker opened for provider [${providerName}] due to consecutive failures.`);
        }
      }

      this.healthMap.set(providerName, provider);
      logger.error(`Provider error [${providerName}]: ${error}`);
      
      getMcpRegistry().reportError(providerName, error).catch(() => {});
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
    return health?.healthStatus === 'ONLINE' && health?.circuitBreakerStatus === 'closed';
  }
}

let _providerRegistry: ProviderRegistry | null = null;
export function getProviderRegistry(): ProviderRegistry {
  if (!_providerRegistry) _providerRegistry = new ProviderRegistry();
  return _providerRegistry;
}
