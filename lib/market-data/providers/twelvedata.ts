import { PriceProvider } from '../types';
import { MarketSnapshot, Candle } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { getQueueManager } from '../../redis/queue';
import { getEnv } from '../../utils/env';

export class TwelveDataProvider implements PriceProvider {
  public name = 'TwelveData';
  private apiKey: string | undefined;
  private ws: any = null;
  private reconnectAttempts = 0; // using any to avoid type issues with global WebSocket vs ws
  private latestPrices: Map<string, MarketSnapshot> = new Map();
  private wsStarted: boolean = false;

  private get currentApiKey(): string | undefined {
    return getEnv('TWELVEDATA_API_KEY') || this.apiKey;
  }

  constructor() {
    this.apiKey = getEnv('TWELVEDATA_API_KEY');
    logger.info('TwelveData Provider Initialized');
  }

  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  private cleanupWebSocket() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === 1 || this.ws.readyState === 0) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private initWebSocket() {
    this.cleanupWebSocket();

    const key = this.currentApiKey;
    if (!key || key === 'undefined') {
      logger.warn('TwelveData WS: API key is empty. Skipping WS init.');
      this.wsStarted = false;
      this.reconnectAttempts = 0;
      return;
    }
    
    // Do not start WS if we are inside Next.js build or edge runtime
    if (process.env.NEXT_PHASE || process.env.NEXT_RUNTIME) {
       return;
    }

    logger.info('TwelveData WS: Initializing connection...');
    try {
      this.ws = new (globalThis as any).WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${key}`);
      
      this.ws.addEventListener('open', () => {
        this.reconnectAttempts = 0;
        logger.info('TwelveData WebSocket connected');
        this.ws?.send(JSON.stringify({
          "action": "subscribe",
          "params": {
            "symbols": "XAU/USD"
          }
        }));
      });

      this.ws.addEventListener('message', (event: any) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.status === 'error') {
            logger.error(`TwelveData WS Error: ${msg.message}`);
            if (msg.message && msg.message.toLowerCase().includes('api key')) {
                getProviderRegistry().reportError(this.name, msg.message);
                this.apiKey = undefined;
            }
            return;
          }
          
          if (msg.event === 'price' && msg.symbol) {
            const normalizedSymbol = msg.symbol.replace('/', '');
            const snapshot = {
              symbol: normalizedSymbol,
              price: parseFloat(msg.price),
              timestamp: new Date(msg.timestamp * 1000).toISOString(),
              provider: this.name,
              freshness: 'live' as const
            };
            this.latestPrices.set(normalizedSymbol, snapshot);
            
            // Broadcast market update with deduplication across instances
            const dedupKey = `tick_${normalizedSymbol}_${msg.timestamp}`;
            getQueueManager().deduplicate(dedupKey, 2).then(isNew => {
               if (isNew) {
                 getQueueManager().streamPublish('market-stream', {
                   id: `tick-${Date.now()}`,
                   type: 'MARKET_TICK',
                   payload: snapshot,
                   timestamp: snapshot.timestamp,
                   retryCount: 0
                 });
               }
            });
          }
        } catch (e) {
           // ignore parse errors
        }
      });

      this.ws.addEventListener('close', () => {
        if (!this.apiKey) {
          logger.warn('TwelveData WebSocket disconnected due to invalid API key. Pausing reconnect for 60s.');
          this.reconnectTimeout = setTimeout(() => this.initWebSocket(), 60000);
        } else {
          this.reconnectAttempts++;
          const backoff = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000);
          logger.warn(`TwelveData WebSocket disconnected. Reconnecting in ${backoff}ms...`);
          this.reconnectTimeout = setTimeout(() => this.initWebSocket(), backoff);
        }
      });
      
      this.ws.addEventListener('error', (event: any) => {
        logger.error(`TwelveData WS Error: ${event.message || 'Unknown error'}`);
      });
    } catch (err: any) {
      logger.error(`TwelveData WS Init Error: ${err.message}`);
    }
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1min', 'M5': '5min', 'M15': '15min', 'M30': '30min',
      'H1': '1h', 'H4': '4h', 'D1': '1day', 'W1': '1week'
    };
    return map[tf.toUpperCase()] || '15min';
  }

  private formatSymbol(symbol: string): string {
    if (symbol === 'XAUUSD') return 'XAU/USD';
    return symbol;
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    if (!this.currentApiKey) {
      throw new Error('TwelveData API key is not configured');
    }
    
    if (!this.wsStarted && !this.ws) {
      this.wsStarted = true;
      this.initWebSocket();
    }
    
    const formattedSymbol = this.formatSymbol(symbol);
    
    // Check WS cache first
    const cached = this.latestPrices.get(symbol);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.timestamp).getTime();
      if (ageMs < 60000) {
        return cached;
      }
    }

    // Fallback to HTTP Polling if WS is stale or not connected
    try {
      logger.info(`TwelveData REST: Fetching live price for ${formattedSymbol}`);
      const res = await fetchWithRetry(`https://api.twelvedata.com/price?symbol=${formattedSymbol}&apikey=${this.currentApiKey}`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();
      
      if (data.code || !data.price) {
        throw new Error(data.message || 'Failed to fetch price');
      }

      getProviderRegistry().reportSuccess(this.name);
      return {
        symbol,
        price: parseFloat(data.price),
        timestamp: new Date().toISOString(),
        provider: this.name,
        freshness: 'live'
      };
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & import('@/types').ProviderStatus> {
    const key = this.currentApiKey;
    if (!key) {
      throw new Error('TwelveData API key is not configured');
    }
    
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      const interval = this.mapTimeframe(timeframe);
      const res = await fetchWithRetry(`https://api.twelvedata.com/time_series?symbol=${formattedSymbol}&interval=${interval}&outputsize=${limit}&apikey=${key}`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();

      if (data.code || !data.values) {
        throw new Error(data.message || 'Failed to fetch candles');
      }

      const candles = data.values.map((v: any) => ({
        timestamp: new Date(v.datetime).toISOString(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume)
      }));

      // TwelveData returns descending order (newest first). Let's sort to ascending if needed, typically we return oldest to newest in arrays, let's reverse.
      return candles.reverse();
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
