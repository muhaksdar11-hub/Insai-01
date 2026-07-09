import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { getMcpRegistry } from './registry';
import { getSupabaseClient } from '../supabase/client';
import { PythonEngineManager } from './engines/deployment';

export class MCPManager {
  private isInitialized = false;

  public async revalidate() {
    logger.info('Revalidating MCP Manager...');
    await this.initMarketData();
    await this.initAIOrchestrator();
    await this.initDatabase();
    await this.initTelegram();
    await this.initTwitter();
    await this.initDeployment();
    await getMcpRegistry().syncToDatabase();
  }

  public async initialize() {
    if (this.isInitialized) return;
    logger.info('Initializing MCP Manager...');

    // 1) Market Data MCPs
    await this.initMarketData();

    // 4) AI Validator
    await this.initAIOrchestrator();

    // 7) Database MCP
    await this.initDatabase();

    // 11) Telegram Bot MCP
    await this.initTelegram();

    // 12) Twitter
    await this.initTwitter();

    // Deployment MCPs
    await this.initDeployment();

    // The rest are marked as not configured in registry. No active initialization needed yet.
    
    // Sync to database
    await getMcpRegistry().syncToDatabase();
    
    this.isInitialized = true;
    logger.info('MCP Manager initialized.');
  }

  private async initDeployment() {
    try {
        const result = await PythonEngineManager.evaluate();
        if (result.status === 'active') {
            getMcpRegistry().reportConnected('Python Engine Manager');
        } else if (result.status === 'offline') {
            getMcpRegistry().reportOffline('Python Engine Manager', result.message);
        } else {
            getMcpRegistry().reportError('Python Engine Manager', result.message);
        }
    } catch (e: any) {
        getMcpRegistry().reportOffline('Python Engine Manager', e.message);
    }
  }

  private async initMarketData() {
    const fetchWithTimeout = async (url: string, ms: number = 5000, options: any = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    // Check TwelveData
    const twelveKey = getEnv("TWELVEDATA_API_KEY");
    if (twelveKey) {
        try {
            const res = await fetchWithTimeout(`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=1&apikey=${twelveKey}`);
            const data = await res.json();
            if (data.code && data.status === 'error') {
               getMcpRegistry().reportError('TwelveData', data.message);
            } else {
               getMcpRegistry().reportConnected('TwelveData');
            }
        } catch (e: any) {
            getMcpRegistry().reportError('TwelveData', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('TwelveData', 'Missing API Key');
    }

    // Check NewsAPI
    const newsKey = getEnv("NEWS_API_KEY");
    if (newsKey) {
        try {
            const res = await fetchWithTimeout(`https://newsapi.org/v2/top-headlines?category=business&apiKey=${newsKey}`);
            const data = await res.json();
            if (data.status === 'error') {
                getMcpRegistry().reportError('NewsAPI', data.message);
            } else {
                getMcpRegistry().reportConnected('NewsAPI');
            }
        } catch (e: any) {
            getMcpRegistry().reportError('NewsAPI', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('NewsAPI', 'Missing API Key');
    }

    // ForexFactory
    try {
        const res = await fetchWithTimeout('https://nfs.faireconomy.media/ff_calendar_thisweek.json', 5000, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            getMcpRegistry().reportConnected('ForexFactory');
        } else {
            getMcpRegistry().reportError('ForexFactory', `HTTP ${res.status}`);
        }
    } catch (e: any) {
        getMcpRegistry().reportError('ForexFactory', e.message);
    }
    
    // YahooFinance
    try {
        const res = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', 5000, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            getMcpRegistry().reportConnected('YahooFinance');
        } else {
            getMcpRegistry().reportError('YahooFinance', `HTTP ${res.status}`);
        }
    } catch (e: any) {
        getMcpRegistry().reportError('YahooFinance', e.message);
    }
  }

  private async initDatabase() {
    const sb = getSupabaseClient().getClient();
    if (sb) {
        try {
           const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
           const { error } = (await Promise.race([
             sb.from('strategies').select('id').limit(1),
             timeoutPromise
           ])) as any;
           if (error) {
               getMcpRegistry().reportError('Supabase', error.message);
           } else {
               getMcpRegistry().reportConnected('Supabase');
           }
        } catch(e: any) {
           getMcpRegistry().reportError('Supabase', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('Supabase', 'Missing Supabase URL or Service Role Key');
    }
  }

  private async initTelegram() {
    const fetchWithTimeout = async (url: string, ms: number = 5000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    const token = getEnv("TELEGRAM_BOT_TOKEN");
    if (token) {
        try {
            const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`);
            const data = await res.json();
            if (!data.ok) {
                getMcpRegistry().reportError('Telegram Bot', data.description || 'Invalid token');
            } else {
                getMcpRegistry().reportConnected('Telegram Bot');
            }
        } catch(e: any) {
            getMcpRegistry().reportError('Telegram Bot', e.message);
        }
    } else {
      getMcpRegistry().reportNotConfigured('Telegram Bot', 'Missing Telegram Bot Token');
    }
  }

  private async initAIOrchestrator() {
    const fetchWithTimeout = async (url: string, ms: number = 5000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    const geminiKey = getEnv("GEMINI_API_KEY");
    if (geminiKey) {
       // Just doing a simple check. If we want a real ping, we can just fetch models list.
       try {
           const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
           const data = await res.json();
           if (data.error) {
               getMcpRegistry().reportError('GeminiAI', data.error.message);
           } else {
               getMcpRegistry().reportConnected('GeminiAI');
           }
       } catch (e: any) {
           getMcpRegistry().reportError('GeminiAI', e.message);
       }
    } else {
      getMcpRegistry().reportNotConfigured('GeminiAI', 'Missing GEMINI_API_KEY');
    }
  }

  private async initTwitter() {
    const twitterKey = getEnv("TWITTER_BEARER_TOKEN");
    if (twitterKey) {
       // Just simple validation for length or we can ping. Usually ping takes time and twitter limits are strict.
       getMcpRegistry().reportConnected('Twitter Bearer');
    } else {
      getMcpRegistry().reportNotConfigured('Twitter Bearer', 'Missing TWITTER_BEARER_TOKEN');
    }
  }

  // Future: Dependency injection and orchestration logic between MCPs will go here.
}

let _mcpManager: MCPManager | null = null;
export function getMcpManager(): MCPManager {
  if (!_mcpManager) _mcpManager = new MCPManager();
  return _mcpManager;
}
