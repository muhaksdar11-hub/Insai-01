import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { getEnv } from '../../utils/env';

export class PolygonProvider implements PriceProvider {
  public name = 'Polygon.io';
  private apiKey: string | undefined;

  private get currentApiKey(): string | undefined {
    return getEnv('POLYGON_API_KEY') || this.apiKey;
  }

  constructor() {
    this.apiKey = getEnv('POLYGON_API_KEY');
    logger.info('PolygonProvider Initialized');
  }

  private mapTimeframe(tf: string): { multiplier: number, timespan: string } {
    const map: Record<string, { multiplier: number, timespan: string }> = {
      'M1': { multiplier: 1, timespan: 'minute' },
      'M5': { multiplier: 5, timespan: 'minute' },
      'M15': { multiplier: 15, timespan: 'minute' },
      'M30': { multiplier: 30, timespan: 'minute' },
      'H1': { multiplier: 1, timespan: 'hour' },
      'H4': { multiplier: 4, timespan: 'hour' },
      'D1': { multiplier: 1, timespan: 'day' },
      'W1': { multiplier: 1, timespan: 'week' }
    };
    return map[tf.toUpperCase()] || { multiplier: 15, timespan: 'minute' };
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    if (!this.currentApiKey) {
      throw new Error('Polygon API key is not configured');
    }

    try {
      logger.info(`Polygon REST: Fetching live price for ${symbol}`);
      const ticker = symbol === 'XAUUSD' ? 'C:XAUUSD' : `C:${symbol}`;
      const res = await fetchWithRetry(`https://api.polygon.io/v2/last/nbbo/${ticker}?apiKey=${this.currentApiKey}`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();
      
      if (data.status !== 'OK' || !data.results) {
        throw new Error(data.error || 'Failed to fetch price');
      }

      getProviderRegistry().reportSuccess(this.name);
      return {
        symbol,
        price: parseFloat(data.results.P), // Use Ask Price (P) or Bid (p)
        timestamp: new Date(data.results.t).toISOString(),
        provider: this.name,
        freshness: 'live'
      };
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & ProviderStatus> {
    const key = this.currentApiKey;
    if (!key) {
      throw new Error('Polygon API key is not configured');
    }
    
    try {
      const { multiplier, timespan } = this.mapTimeframe(timeframe);
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - 60 * 24 * 60 * 60 * 1000); 
      const to = toDate.toISOString().split('T')[0];
      const from = fromDate.toISOString().split('T')[0];
      const ticker = symbol === 'XAUUSD' ? 'C:XAUUSD' : `C:${symbol}`;

      const res = await fetchWithRetry(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=desc&limit=${limit}&apiKey=${key}`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();

      if (data.status !== 'OK' || !data.results) {
        throw new Error(data.error || 'Failed to fetch candles');
      }

      const candles = data.results.map((v: any) => ({
        timestamp: new Date(v.t).toISOString(),
        open: parseFloat(v.o),
        high: parseFloat(v.h),
        low: parseFloat(v.l),
        close: parseFloat(v.c),
        volume: parseFloat(v.v)
      }));

      return candles.reverse() as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
