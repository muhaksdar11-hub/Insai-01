import { CalendarProvider } from '../types';
import { CalendarEvent } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';

export class ForexFactoryProvider implements CalendarProvider {
  public name = 'ForexFactory';
  private currentRequest: Promise<any> | null = null;
  private cachedData: any = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache internal

  private async fetchWithRetry(url: string, maxRetries = 3): Promise<any> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          cache: 'no-store'
        });

        if (res.status === 429) {
          throw new Error('Rate Limited');
        }

        if (!res.ok) {
          throw new Error(`HTTP Error: ${res.status}`);
        }

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Received non-JSON response from ForexFactory");
        }

        return await res.json();
      } catch (error: any) {
        attempt++;
        if (error.message === 'Rate Limited') {
          getProviderRegistry().reportError(this.name, 'Rate Limited');
          if (attempt >= maxRetries) throw new Error('Provider Unavailable (Rate Limited)');
          // Exponential backoff
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
        } else {
          if (attempt >= maxRetries) throw error;
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }
  }

  async getCalendarEvents(): Promise<CalendarEvent[] & import('@/types').ProviderStatus> {
    const now = Date.now();
    
    // Internal cache to prevent spamming if upper layer misses caching
    if (this.cachedData && (now - this.lastFetchTime < this.CACHE_TTL_MS)) {
      return this.cachedData;
    }

    if (this.currentRequest) {
      return this.currentRequest;
    }

    this.currentRequest = (async () => {
      try {
        const data = await this.fetchWithRetry('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
        
        getProviderRegistry().reportSuccess(this.name);
        this.lastFetchTime = Date.now();
        
        const mappedData = data.map((item: any) => ({
          id: item.id || Math.random().toString(),
          title: item.title,
          country: item.country,
          impact: item.impact.toLowerCase() === 'high' ? 'high' : item.impact.toLowerCase() === 'medium' ? 'medium' : 'low',
          time: item.date
        }));
        
        this.cachedData = mappedData;
        return mappedData;
      } catch (e: any) {
        let msg = e.message;
        if (msg === 'Rate Limited' || msg.includes('429')) {
          msg = 'Rate Limited';
        } else if (msg.includes('fetch failed') || msg.includes('Unavailable')) {
          msg = 'Provider Unavailable';
        }
        
        // If we have stale data, return it instead of failing
        if (this.cachedData) {
           logger.warn(`ForexFactory failed (${msg}), returning stale cached data`);
           return this.cachedData;
        }

        getProviderRegistry().reportError(this.name, msg);
        throw new Error(msg);
      } finally {
        this.currentRequest = null;
      }
    })();

    return this.currentRequest;
  }
}
