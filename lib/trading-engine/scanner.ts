import { TradingEngine } from './engine';
import { getMarketDataService } from '../market-data/market-data-service';
import { logger } from '../utils/logger';
import crypto from "crypto";
import { getQueueManager } from '../redis/queue';
import { MarketSnapshot } from '@/types';
import { metricsEngine } from '../observability/metrics-engine';
import { errorTracker } from '../observability/error-tracker';

export class MarketScanner {
  private engine: TradingEngine;
  private isRunning: boolean = false;
  private isScanning: boolean = false;
  private lastScanTime: number = 0;
  private marketUpdateHandler: ((msg: any) => Promise<void>) | null = null;
  
  // Cache strategies to avoid DB bottlenecks in hot path
  private strategiesCache: { activeCount: number, expiresAt: number } | null = null;
  private readonly STRATEGIES_CACHE_TTL = 300000; // 5 minutes

  constructor() {
    this.engine = new TradingEngine();
  }

  private timer: NodeJS.Timeout | null = null;

  public async start() {
    if (this.isRunning) return;
    
    await this.engine.init();
    
    this.isRunning = true;
    logger.info(`Market Scanner started in WebSocket real-time mode with fallback interval`);
    
    // Subscribe to real-time market updates
    this.marketUpdateHandler = async (msg: any) => {
      if (!this.isRunning) return;
      
      const snapshot = msg.payload as MarketSnapshot;
      if (snapshot.symbol === 'XAUUSD') {
        const now = Date.now();
        if (now - this.lastScanTime > 1000) {
          this.lastScanTime = now;
          this.scan();
        }
      }
    };
    getQueueManager().streamSubscribeGroup('market_stream:XAUUSD', 'scanner-group', 'scanner-' + Math.random().toString(36).substring(7), this.marketUpdateHandler as any);
    
    // Initial scan
    this.scan();
    
    // Fallback interval (every 15 seconds) in case WebSocket/Redis is down
    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 1000) {
        this.lastScanTime = now;
        this.scan();
      }
    }, 5000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.marketUpdateHandler) {
      // getQueueManager().unsubscribe('market-updates', this.marketUpdateHandler); // Stream polling stops when isRunning=false
      this.marketUpdateHandler = null;
    }

    logger.info('Market Scanner stopped');
  }

  public async scan() {
    if (this.isScanning) {
       logger.debug('Scan already in progress, skipping.');
       return;
    }
    
    // Acquire distributed lock for scanning
    const lockAcquired = await getQueueManager().acquireLock('market_scan_xauusd', 10);
    if (!lockAcquired) {
       logger.debug('Another instance is currently scanning. Skipping.');
       return;
    }
    
    this.isScanning = true;
    const startTime = Date.now();
    try {
      // 1. Check if any strategies are active before fetching data
      let activeCount = 0;
      const now = Date.now();
      
      let cachedData = null;
      try {
        const redisCached = await getQueueManager().getCache<{ activeCount: number, expiresAt: number }>('active_strategies_count');
        if (redisCached && redisCached.expiresAt > now) {
          cachedData = redisCached;
          metricsEngine.recordCacheAccess(true);
        } else {
          metricsEngine.recordCacheAccess(false);
        }
      } catch (e) {
        if (this.strategiesCache && this.strategiesCache.expiresAt > now) {
          cachedData = this.strategiesCache;
          metricsEngine.recordCacheAccess(true);
        }
      }

      if (cachedData) {
         activeCount = cachedData.activeCount;
      } else {
         try {
           const { getSupabaseClient } = await import('../supabase/client');
           const strats = await getSupabaseClient().getStrategies();
           if (Array.isArray(strats) && strats.length > 0) {
             activeCount = strats.filter(s => s.enabled).length;
             logger.info(`Found ${strats.length} strategies, ${activeCount} active.`);
           } else {
             logger.warn(`getStrategies returned empty or non-array. Defaulting to 0.`);
             activeCount = 0; 
           }
         } catch (e: any) {
           logger.warn(`Failed to check active strategies. Skipping scan to be safe. Error: ${e.message}`);
           activeCount = 0;
         }
         const cacheEntry = { activeCount, expiresAt: now + this.STRATEGIES_CACHE_TTL };
         this.strategiesCache = cacheEntry;
         getQueueManager().setCache('active_strategies_count', cacheEntry, Math.ceil(this.STRATEGIES_CACHE_TTL / 1000)).catch(() => {});
      }
      
      if (activeCount === 0) {
        logger.info('No active strategies, skipping market scan.');
        return;
      }

      logger.info('Running market scan for XAUUSD (triggered by real-time WebSocket/throttle)...');
      
      // 2. Get Context
      const baseContext = await getMarketDataService().getContextData("XAUUSD", "M15");
      const correlationId = crypto.randomUUID();
      const context = { ...baseContext, correlationId };
      
      // 3. Pass to engine
      this.engine.processMarketData('XAUUSD', 'M15', context);
      
    } catch (error: any) {
      if (error.message.includes('not configured')) {
        logger.warn(`Market scan skipped: ${error.message}`);
      } else if (error.message.includes('DATA_VALIDATION_ERROR')) {
        logger.error(`Pipeline stopped by Data Validation Layer: ${error.message}`);
        import('../observability/audit-logger').then(({ auditLogger }) => {
           auditLogger.log({
             action: 'DATA_VALIDATION_FAILED',
             entity: 'market_data',
             entity_id: 'XAUUSD',
             status: 'failure',
             details: { reason: error.message }
           });
        });
      } else {
        errorTracker.trackError({
          component: 'MarketScanner',
          error: error,
          severity: 'high'
        });
        logger.error(`Market scan failed: ${error.message}`);
      }
    } finally {
      this.isScanning = false;
      metricsEngine.recordScannerDuration(Date.now() - startTime);
      await getQueueManager().releaseLock('market_scan_xauusd');
    }
  }
}

// Singleton for app-wide usage if needed
let _marketScanner: MarketScanner | null = null;
export function getMarketScanner(): MarketScanner {
  if (!_marketScanner) _marketScanner = new MarketScanner();
  return _marketScanner;
}
