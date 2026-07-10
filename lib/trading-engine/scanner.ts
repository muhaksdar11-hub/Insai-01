import { TradingEngine } from './engine';
import { getMarketDataService } from '../market-data/market-data-service';
import { logger } from '../utils/logger';
import crypto from "crypto";
import { getQueueManager } from '../redis/queue';
import { MarketSnapshot } from '@/types';

export class MarketScanner {
  private engine: TradingEngine;
  private isRunning: boolean = false;
  private lastScanTime: number = 0;
  
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
    getQueueManager().subscribe('market-updates', async (msg) => {
      if (!this.isRunning) return;
      
      const snapshot = msg.payload as MarketSnapshot;
      if (snapshot.symbol === 'XAUUSD') {
        const now = Date.now();
        if (now - this.lastScanTime > 60000) {
          this.lastScanTime = now;
          this.scan();
        }
      }
    });
    
    // Initial scan
    this.scan();
    
    // Fallback interval (every 60 seconds) in case WebSocket/Redis is down
    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 60000) {
        this.lastScanTime = now;
        this.scan();
      }
    }, 60000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Market Scanner stopped');
  }

  public async scan() {
    try {
      // 1. Check if any strategies are active before fetching data
      let activeCount = 0;
      try {
        const { getSupabaseClient } = await import('../supabase/client');
        const strats = await getSupabaseClient().getStrategies();
        if (Array.isArray(strats)) {
          activeCount = strats.filter(s => s.enabled).length;
          logger.info(`Found ${strats.length} strategies, ${activeCount} active.`);
        } else {
          logger.warn(`getStrategies returned non-array:`, strats);
        }
      } catch (e: any) {
        // Assume none active if DB fails, wait for next tick
        logger.warn(`Failed to check active strategies, skipping scan tick. Error: ${e.message}`);
        return;
      }
      
      if (activeCount === 0) {
        // logger.debug('No active strategies, skipping market scan.');
        return; // Don't trigger data fetching if not needed!
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
        logger.error(`Market scan failed: ${error.message}`);
      }
    }
  }
}

// Singleton for app-wide usage if needed
let _marketScanner: MarketScanner | null = null;
export function getMarketScanner(): MarketScanner {
  if (!_marketScanner) _marketScanner = new MarketScanner();
  return _marketScanner;
}
