import { NewsProvider } from '../types';
import { NewsEvent, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { getEnv } from '../../utils/env';

export class NewsApiProvider implements NewsProvider {
  public name = 'NewsAPI';
  private apiKey: string | undefined;

  private get currentApiKey(): string | undefined {
    return getEnv('NEWS_API_KEY') || this.apiKey;
  }

  constructor() {
    this.apiKey = getEnv('NEWS_API_KEY');
  }

  async getLatestNews(): Promise<NewsEvent[] & ProviderStatus> {
    const key = this.currentApiKey;
    if (!key) {
      throw new Error('NewsAPI key is not configured');
    }

    try {
      const res = await fetchWithRetry(`https://newsapi.org/v2/everything?q=gold+OR+XAUUSD+OR+forex&language=en&sortBy=publishedAt&pageSize=5&apiKey=${key}`, {
        timeoutMs: 3000,
        retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();
      
      if (data.status !== 'ok') {
        throw new Error(data.message || 'NewsAPI fetch failed');
      }

      getProviderRegistry().reportSuccess(this.name);
      return (data.articles || []).map((article: any) => ({
        id: article.url,
        title: article.title,
        source: article.source.name,
        publishedAt: article.publishedAt,
        impact: 'low', // default impact
        currency: 'USD'
      }));
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
