import { NewsProvider } from '../types';
import { NewsEvent, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { getEnv } from '../../utils/env';

export class TwitterProvider implements NewsProvider {
  public name = 'Twitter Bearer';
  
  private get currentApiKey(): string | undefined {
    return getEnv('TWITTER_BEARER_TOKEN');
  }

  async getLatestNews(): Promise<NewsEvent[] & ProviderStatus> {
    if (!this.currentApiKey) {
      throw new Error('TWITTER_BEARER_TOKEN is not configured');
    }
    
    try {
      logger.info('Twitter: Fetching latest tweets...');
      // Note: We use recent search endpoint
      const query = encodeURIComponent('gold OR XAUUSD OR forex -is:retweet');
      const res = await fetchWithRetry(`https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=10&tweet.fields=created_at,author_id`, {
          headers: {
            'Authorization': `Bearer ${this.currentApiKey}`
          },
          timeoutMs: 3000,
          retries: 2
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      const data = await res.json();
      
      if (data.errors || !data.data) {
        throw new Error(data.detail || data.errors?.[0]?.message || 'Failed to fetch tweets');
      }

      getProviderRegistry().reportSuccess(this.name);
      
      const news: NewsEvent[] = data.data.map((v: any) => ({
        id: v.id,
        title: v.text.substring(0, 100) + '...',
        content: v.text,
        source: 'Twitter',
        publishedAt: new Date(v.created_at).toISOString(),
        sentiment: 'neutral', // default, could be analyzed
        impact: 'low',
        url: `https://twitter.com/i/web/status/${v.id}`
      }));
      
      return news as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
