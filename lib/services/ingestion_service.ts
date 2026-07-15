import { logger } from '../utils/logger';
import { getQueueManager } from '../redis/queue';
import { YahooProvider } from './providers/yahoo_provider';
import { TwelveDataProvider } from './providers/twelvedata_provider';
import { PolygonProvider } from './providers/polygon_provider';

export class IngestionService {
  private currentSymbol: string = 'XAUUSD';
  private yahooProvider = new YahooProvider();
  private twelveDataProvider = new TwelveDataProvider();
  private polygonProvider = new PolygonProvider();
  
  private lastUpdateTimestamp: number = 0;
  private fallbackInterval: NodeJS.Timeout | null = null;

  constructor() {}

  public async start(symbol: string = 'XAUUSD') {
    this.currentSymbol = symbol;
    
    logger.info(`Starting Ingestion Service for ${symbol}`);
    
    // 1. Ambil history saat inisialisasi menggunakan Yahoo
    try {
      const history = await this.yahooProvider.getHistory(symbol, '15m', 500);
      if (history.length > 0) {
        logger.info(`Yahoo history loaded: ${history.length} candles for ${symbol}`);
        // Kirim candle terakhir sebagai inisialisasi
        this.pushToRedis({
          symbol,
          price: history[history.length - 1].close,
          timestamp: history[history.length - 1].timestamp,
          provider: this.yahooProvider.name,
          freshness: 'cached'
        });
      }
    } catch (e: any) {
      logger.error(`Failed to load initial history from Yahoo: ${e.message}`);
    }

    // 2. Subscribe Realtime dari TwelveData WS
    this.lastUpdateTimestamp = Date.now();
    this.twelveDataProvider.subscribeRealtime(symbol, (data) => {
      this.lastUpdateTimestamp = Date.now();
      this.pushToRedis(data);
    });

    // 3. Fallback Mechanism (Polygon REST / Yahoo)
    this.startFallbackMonitor();
  }

  private startFallbackMonitor() {
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);

    this.fallbackInterval = setInterval(async () => {
      const now = Date.now();
      // Jika data berhenti mengalir selama > 30 detik
      if (this.lastUpdateTimestamp > 0 && (now - this.lastUpdateTimestamp) > 30000) {
        logger.warn('TwelveData WS timeout. Fallback to Polygon REST...');
        
        try {
          const fallbackData = await this.polygonProvider.getLatestPrice(this.currentSymbol);
          if (fallbackData) {
            this.pushToRedis(fallbackData);
            this.lastUpdateTimestamp = Date.now(); // reset monitor
          } else {
             logger.warn('Polygon REST failed. Fallback to Yahoo REST...');
             
             // Karena Yahoo tidak punya endpoint simple price, kita pakai history 1m terdekat
             const yahooHistory = await this.yahooProvider.getHistory(this.currentSymbol, '1m', 1);
             if (yahooHistory.length > 0) {
                this.pushToRedis({
                   symbol: this.currentSymbol,
                   price: yahooHistory[0].close,
                   timestamp: yahooHistory[0].timestamp,
                   provider: this.yahooProvider.name,
                   freshness: 'fallback'
                });
                this.lastUpdateTimestamp = Date.now(); // reset monitor
             } else {
                logger.error('All providers down (TwelveData, Polygon, Yahoo, MT5 not configured)');
             }
          }
        } catch (e: any) {
          logger.error(`Fallback failed: ${e.message}`);
        }
      }
    }, 15000);
  }

  private async pushToRedis(data: any) {
    try {
      if (!data.symbol || (!data.price && !data.close)) return;
      
      const streamKey = `market_stream:${data.symbol}`;
      await getQueueManager().streamPublish(streamKey, {
        id: `tick-${Date.now()}`,
        type: 'MARKET_DATA',
        payload: data,
        timestamp: data.timestamp,
        retryCount: 0
      });
    } catch (e) {
      // ignore
    }
  }
}

let _ingestionService: IngestionService | null = null;
export function getIngestionService() {
  if (!_ingestionService) {
    _ingestionService = new IngestionService();
  }
  return _ingestionService;
}
