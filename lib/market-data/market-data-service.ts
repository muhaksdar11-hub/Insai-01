import { MarketSnapshot, Candle, NewsEvent, CalendarEvent } from '@/types';
import { TwelveDataProvider } from './providers/twelvedata';
import { YahooFinanceProvider } from './providers/yahoofinance';
import { NewsApiProvider } from './providers/newsapi';
import { ForexFactoryProvider } from './providers/forexfactory';
import { getProviderRegistry } from './provider-registry';
import { logger } from '../utils/logger';
import { FallbackChain } from './fallback-chain';
import { PriceProvider, NewsProvider, CalendarProvider } from './types';
import { dataValidator } from './data-validator';

export class MarketDataService {
  private priceChain: FallbackChain<PriceProvider>;
  private newsChain: FallbackChain<NewsProvider>;
  private calendarChain: FallbackChain<CalendarProvider>;

  // Cache
  private priceCache: Map<string, { data: MarketSnapshot, expiresAt: number }> = new Map();
  private readonly PRICE_CACHE_TTL_MS = 5000; // 5 seconds for price cache

  constructor() {
    this.priceChain = new FallbackChain<PriceProvider>();
    this.newsChain = new FallbackChain<NewsProvider>();
    this.calendarChain = new FallbackChain<CalendarProvider>();

    // Fallback chain for price
    // 1. Primary: TwelveData (status: needs verification until real)
    this.priceChain.addProvider(new TwelveDataProvider(), 'TwelveData');
    // 2. Secondary: YahooFinance (free, active)
    this.priceChain.addProvider(new YahooFinanceProvider(), 'YahooFinance');

    // Fallback chain for news
    this.newsChain.addProvider(new NewsApiProvider(), 'NewsAPI');
    
    // Fallback chain for calendar
    this.calendarChain.addProvider(new ForexFactoryProvider(), 'ForexFactory');
  }

  async getLatestPrice(symbol: string, freshnessWindowMs: number = 15000): Promise<MarketSnapshot> {
    const cached = this.priceCache.get(symbol);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      // Re-evaluate freshness based on the requested window
      const snapshotTime = new Date(cached.data.timestamp).getTime();
      const freshness = (now - snapshotTime > freshnessWindowMs) ? 'stale' : 'cached';
      return { ...cached.data, freshness };
    }

    const fallbackSnapshot = {
      symbol,
      price: null,
      timestamp: new Date().toISOString(),
      provider: 'None',
      freshness: 'stale' as const,
      status: 'not_configured',
      available: false,
      reason: 'No price providers available'
    };

    const snapshot = await this.priceChain.execute(
      (p) => p.getLatestPrice(symbol),
      `getLatestPrice(${symbol})`,
      fallbackSnapshot
    );

    // Gap detection / Freshness check based on the dynamic window
    const snapshotTime = new Date(snapshot.timestamp).getTime();
    if (now - snapshotTime > freshnessWindowMs) {
       logger.warn(`Data gap detected for ${symbol} from ${snapshot.provider}. Data is stale (> ${freshnessWindowMs}ms).`);
       snapshot.freshness = 'stale';
    } else {
       snapshot.freshness = 'live';
    }
    this.priceCache.set(symbol, {
      data: snapshot,
      expiresAt: now + this.PRICE_CACHE_TTL_MS
    });

    return snapshot;
  }

  private candleCache: Map<string, { data: Candle[], expiresAt: number }> = new Map();
  private readonly CANDLE_CACHE_TTL_MS = 5000; // 5 seconds for candles within the same cycle

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[]> {
    const cacheKey = `${symbol}-${timeframe}-${limit}`;
    const now = Date.now();
    const cached = this.candleCache.get(cacheKey);
    
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const fallbackCandles = Object.assign([], {
      status: 'not_configured',
      available: false,
      reason: 'No candle providers available'
    });
    
    const data = await this.priceChain.execute(
      (p) => p.getCandles(symbol, timeframe, limit),
      `getCandles(${symbol}, ${timeframe})`,
      fallbackCandles
    );

    if (!data.status || data.status !== 'not_configured') {
      this.candleCache.set(cacheKey, {
        data,
        expiresAt: now + this.CANDLE_CACHE_TTL_MS
      });
    }

    return data;
  }

  async getLatestNews(): Promise<NewsEvent[]> {
    const fallbackNews = Object.assign([], {
      status: 'not_configured',
      available: false,
      reason: 'NEWS_API_KEY is not configured'
    });
    return this.newsChain.execute(
      (p) => p.getLatestNews(),
      'getLatestNews',
      fallbackNews
    );
  }

  private calendarCache: { data: CalendarEvent[], expiresAt: number } | null = null;
  private readonly CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const now = Date.now();
    if (this.calendarCache && this.calendarCache.expiresAt > now) {
      return this.calendarCache.data;
    }

    const fallbackCalendar = Object.assign([], {
      status: 'not_configured',
      available: false,
      reason: 'No calendar providers available'
    });
    const data = await this.calendarChain.execute(
      (p) => p.getCalendarEvents(),
      'getCalendarEvents',
      fallbackCalendar
    );
    
    // Only cache if it's an actual successful array (no status field)
    if (!data.hasOwnProperty('status')) {
        this.calendarCache = {
            data,
            expiresAt: now + this.CALENDAR_CACHE_TTL_MS
        };
    }
    
    return data;
  }

  async getContextData(symbol: string, timeframe: string, freshnessWindowMs: number = 15000) {
    const [price, news, calendar, candles] = await Promise.all([
      this.getLatestPrice(symbol, freshnessWindowMs),
      this.getLatestNews(),
      this.getCalendarEvents(),
      this.getCandles(symbol, timeframe, 250)
    ]);
    
    // VALIDATION LAYER
    if (candles && Array.isArray(candles) && !candles.hasOwnProperty('status')) {
       const candleValidation = dataValidator.validateCandles(candles, symbol, timeframe);
       if (!candleValidation.isValid) {
         logger.warn(`Data Validation Failed for ${symbol} ${timeframe}: ${candleValidation.reason}`);
         throw new Error(`DATA_VALIDATION_ERROR: ${candleValidation.reason}`);
       }
    }
    
    if (price && price.price !== null) {
       // If spread is available, we could validate it here. Let's assume price has bid/ask or spread if real provider.
       // Without bid/ask, we will skip spread validation for now.
    }

    return {
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      price,
      news,
      calendar,
      candles,
      health: getProviderRegistry().getAllHealth()
    };
  }
}

let _marketDataService: MarketDataService | null = null;
export function getMarketDataService(): MarketDataService {
  if (!_marketDataService) _marketDataService = new MarketDataService();
  return _marketDataService;
}
