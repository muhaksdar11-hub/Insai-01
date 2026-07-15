import { IDataProvider } from '../data_provider';
import yahooFinance from 'yahoo-finance2';
import { logger } from '../../utils/logger';

export class YahooProvider implements IDataProvider {
  public name = 'YahooFinance';

  private formatSymbol(symbol: string): string {
    if (symbol === 'XAUUSD') return 'GC=F'; // Gold futures
    if (symbol === 'DXY') return 'DX-Y.NYB';
    if (symbol === 'US10Y') return '^TNX';
    return symbol;
  }

  async getHistory(symbol: string, timeframe: string = '15m', limit: number = 500): Promise<any[]> {
    const formattedSymbol = this.formatSymbol(symbol);
    try {
      logger.info(`Yahoo history loaded for ${formattedSymbol}`);
      const result: any = await yahooFinance.chart(formattedSymbol, {
        period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        interval: timeframe as any,
      });

      if (!result || !result.quotes) return [];
      
      const candles = result.quotes.map((q: any) => ({
        timestamp: new Date(q.date).toISOString(),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume
      })).filter((c: any) => c.open !== null && c.close !== null);

      return candles.slice(-limit);
    } catch (e: any) {
      logger.error(`YahooProvider Error: ${e.message}`);
      return [];
    }
  }

  subscribeRealtime(_symbol: string, _callback: (data: any) => void): void {
    logger.warn('YahooFinance does not support WebSocket realtime data');
  }
}
