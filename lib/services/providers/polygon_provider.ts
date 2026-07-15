import { IDataProvider } from '../data_provider';
import { logger } from '../../utils/logger';
import { getEnv } from '../../utils/env';

export class PolygonProvider implements IDataProvider {
  public name = 'Polygon.io';

  private formatSymbol(symbol: string): string {
    if (symbol === 'XAUUSD') return 'C:XAUUSD';
    return `C:${symbol}`;
  }

  async getHistory(symbol: string, timeframe: string = 'minute', limit: number = 500): Promise<any[]> {
    const key = getEnv('POLYGON_API_KEY');
    if (!key) return [];

    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      let multiplier = 15;
      if (timeframe === 'minute' || timeframe === '15m' || timeframe === 'M15') {
        multiplier = 15;
        timeframe = 'minute';
      }

      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${formattedSymbol}/range/${multiplier}/${timeframe}/${from}/${to}?adjusted=true&sort=desc&limit=${limit}&apiKey=${key}`);
      const data = await res.json();

      if (data.status !== 'OK' || !data.results) {
        return [];
      }

      const candles = data.results.map((v: any) => ({
        timestamp: new Date(v.t).toISOString(),
        open: parseFloat(v.o),
        high: parseFloat(v.h),
        low: parseFloat(v.l),
        close: parseFloat(v.c),
        volume: parseFloat(v.v)
      }));

      return candles.reverse();
    } catch (e: any) {
      logger.error(`Polygon getHistory Error: ${e.message}`);
      return [];
    }
  }

  subscribeRealtime(_symbol: string, _callback: (data: any) => void): void {
    logger.warn('Polygon WebSocket not implemented for free tier fallback. Used for REST fallback only.');
  }

  async getLatestPrice(symbol: string): Promise<any> {
    const key = getEnv('POLYGON_API_KEY');
    if (!key) return null;

    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const res = await fetch(`https://api.polygon.io/v2/last/nbbo/${formattedSymbol}?apiKey=${key}`);
      const data = await res.json();

      if (data.status !== 'OK' || !data.results) {
        return null;
      }

      return {
        symbol,
        price: parseFloat(data.results.P),
        timestamp: new Date(data.results.t).toISOString(),
        provider: this.name,
        freshness: 'live'
      };
    } catch (e: any) {
      return null;
    }
  }
}
