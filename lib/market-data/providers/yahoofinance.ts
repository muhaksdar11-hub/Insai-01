import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';

export class YahooFinanceProvider implements PriceProvider {
  public name = 'YahooFinance';

  private formatSymbol(symbol: string): string {
    if (symbol === 'XAUUSD') return 'GC=F';
    if (symbol === 'DXY') return 'DX-Y.NYB';
    if (symbol === 'US10Y') return '^TNX';
    return symbol;
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
      'H1': '60m', 'H4': '60m', // Yahoo limits intraday intervals over a few days, let's use 60m for H4 and group later or just rely on 60m for now.
      'D1': '1d', 'W1': '1wk'
    };
    return map[tf.toUpperCase()] || '15m';
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      logger.info(`YahooFinance REST: Fetching live price for ${formattedSymbol}`);
      const res = await fetchWithRetry(`https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?interval=1m&range=1d`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();
      
      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error(data.chart?.error?.description || 'Failed to fetch price');
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const timestamp = new Date(meta.regularMarketTime * 1000).toISOString();

      getProviderRegistry().reportSuccess(this.name);
      return {
        symbol,
        price: parseFloat(price),
        timestamp: timestamp,
        provider: this.name,
        freshness: 'live'
      };
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & ProviderStatus> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      const interval = this.mapTimeframe(timeframe);
      // Determine range based on limit and interval roughly
      let range = '5d';
      if (interval === '1m' || interval === '5m') range = '5d';
      else if (interval === '15m' || interval === '30m') range = '1mo';
      else if (interval === '60m') range = '3mo';
      else range = '1y';

      const res = await fetchWithRetry(`https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?interval=${interval}&range=${range}`, {
          timeoutMs: 5000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();

      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error(data.chart?.error?.description || 'Failed to fetch candles');
      }

      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      
      if (!timestamps || !quote) {
         throw new Error("Missing candle data in response");
      }

      const candles: Candle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
         if (quote.open[i] === null) continue; // Skip empty periods
         candles.push({
            timestamp: new Date(timestamps[i] * 1000).toISOString(),
            open: quote.open[i],
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i] || 0
         });
      }

      // Slice the limit from the end (newest)
      return candles.slice(-limit) as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
