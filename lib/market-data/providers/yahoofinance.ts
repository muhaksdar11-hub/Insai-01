import { PriceProvider } from '../types';
import { MarketSnapshot, Candle } from '@/types';
import { getProviderRegistry } from '../provider-registry';

export class YahooFinanceProvider implements PriceProvider {
  public name = 'YahooFinance';

  private mapSymbol(symbol: string) {
    if (symbol === 'XAUUSD' || symbol === 'XAU/USD') return 'GC=F';
    return symbol;
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${mappedSymbol}?interval=1m&range=1d`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (res.status === 404) {
        throw new Error('Endpoint not found or symbol invalid (HTTP 404)');
      }
      
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received non-JSON response from Yahoo Finance");
      }

      const data = await res.json();
      
      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error('Invalid response from Yahoo Finance: missing chart result');
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const price = meta.regularMarketPrice;

      getProviderRegistry().reportSuccess(this.name);
      return {
        symbol,
        price,
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
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      let interval = '15m';
      let range = '5d';
      
      switch(timeframe) {
        case 'M1': interval = '1m'; range = '1d'; break;
        case 'M5': interval = '5m'; range = '5d'; break;
        case 'M15': interval = '15m'; range = '5d'; break;
        case 'H1': interval = '1h'; range = '1mo'; break;
        case 'H4': interval = '1h'; range = '3mo'; break; // YF doesn't have 4h, need to aggregate if strictly needed
        case 'D1': interval = '1d'; range = '1y'; break;
      }

      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${mappedSymbol}?interval=${interval}&range=${range}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (res.status === 404) {
        throw new Error('Endpoint not found or symbol invalid (HTTP 404)');
      }

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received non-JSON response from Yahoo Finance");
      }

      const data = await res.json();

      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error('Invalid response from Yahoo Finance: missing chart result');
      }

      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];

      const candles: Candle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quotes.open[i] !== null) {
          candles.push({
            timestamp: new Date(timestamps[i] * 1000).toISOString(),
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
            volume: quotes.volume[i]
          });
        }
      }

      getProviderRegistry().reportSuccess(this.name);
      return candles.slice(-limit);
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
