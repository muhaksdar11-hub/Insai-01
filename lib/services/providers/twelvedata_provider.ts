import { IDataProvider } from '../data_provider';
import WebSocket from 'ws';
import { logger } from '../../utils/logger';
import { getEnv } from '../../utils/env';

export class TwelveDataProvider implements IDataProvider {
  public name = 'TwelveData';
  private ws: WebSocket | null = null;

  private formatSymbol(symbol: string): string {
    if (symbol === 'XAUUSD') return 'XAU/USD';
    return symbol;
  }

  async getHistory(symbol: string, timeframe: string = '15min', limit: number = 500): Promise<any[]> {
    const key = getEnv('TWELVEDATA_API_KEY');
    if (!key) return [];

    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${formattedSymbol}&interval=${timeframe}&outputsize=${limit}&apikey=${key}`);
      const data = await res.json();

      if (data.code || !data.values) {
        return [];
      }

      const candles = data.values.map((v: any) => ({
        timestamp: new Date(v.datetime).toISOString(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume)
      }));

      return candles.reverse();
    } catch (e: any) {
      logger.error(`TwelveData getHistory Error: ${e.message}`);
      return [];
    }
  }

  subscribeRealtime(symbol: string, callback: (data: any) => void): void {
    const key = getEnv('TWELVEDATA_API_KEY');
    if (!key) {
      logger.warn('TWELVEDATA_API_KEY not found. Limited Mode active.');
      return;
    }

    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${key}`);

      this.ws.on('open', () => {
        logger.info('TwelveData WS Connected');
        this.ws?.send(JSON.stringify({
          action: 'subscribe',
          params: { symbols: this.formatSymbol(symbol) }
        }));
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'price' && msg.symbol) {
            callback({
              symbol: symbol,
              price: parseFloat(msg.price),
              timestamp: new Date(msg.timestamp * 1000).toISOString(),
              provider: this.name,
              freshness: 'live'
            });
          }
        } catch (e) {
          // Ignore
        }
      });

      this.ws.on('close', () => {
        logger.warn('TwelveData WS Disconnected');
        setTimeout(() => this.subscribeRealtime(symbol, callback), 3000);
      });

      this.ws.on('error', (err: any) => {
        logger.error(`TwelveData WS Error: ${err.message}`);
      });
    } catch (e: any) {
      logger.error(`TwelveData subscribeRealtime Error: ${e.message}`);
    }
  }
}
