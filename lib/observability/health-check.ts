import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { getSupabaseClient } from '../supabase/client';

export type ServiceHealthStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'NOT CONFIGURED' | 'RATE LIMITED' | 'UNAVAILABLE';

export interface ServiceHealth {
  serviceName: string;
  status: ServiceHealthStatus;
  lastChecked: string;
  latencyMs?: number;
  message?: string;
}

export interface SystemHealth {
  status: ServiceHealthStatus;
  services: ServiceHealth[];
  timestamp: string;
}

class HealthCheckEngine {
  private services: Record<string, ServiceHealth> = {};

  constructor() {
    this.registerService('Supabase', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('MarketData', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('EconomicCalendar', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('GeminiAI', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('TelegramBot', 'NOT CONFIGURED', 'Pending validation');
    this.registerService('RuleEngine', 'ONLINE');
    this.registerService('PythonEngine', 'NOT CONFIGURED', 'Checking Python Engine...');
  }

  private registerService(serviceName: string, initialStatus: ServiceHealthStatus, message?: string) {
    this.services[serviceName] = {
      serviceName,
      status: initialStatus,
      lastChecked: new Date().toISOString(),
      message
    };
  }

  public updateServiceHealth(serviceName: string, status: ServiceHealthStatus, latencyMs?: number, message?: string) {
    if (this.services[serviceName]) {
      this.services[serviceName] = {
        ...this.services[serviceName],
        status,
        lastChecked: new Date().toISOString(),
        latencyMs,
        message
      };

      if (status === 'UNAVAILABLE' || status === 'OFFLINE' || status === 'DEGRADED' || status === 'RATE LIMITED') {
         logger.warn(`Service ${serviceName} is ${status}`, {
            service_name: 'HealthCheckEngine',
            target_service: serviceName,
            status,
            reason: message
         });
      }
    }
  }

  public async runHealthChecks(): Promise<SystemHealth> {
    // Perform active checks where possible
    
    // Check Supabase
    try {
        const start = Date.now();
        const sb = getSupabaseClient().getClient();
        if (sb) {
           const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
           const { error } = (await Promise.race([
             sb.from('strategies').select('id').limit(1),
             timeoutPromise
           ])) as any;
           
           if (error) {
               this.updateServiceHealth('Supabase', 'UNAVAILABLE', Date.now() - start, error.message);
           } else {
               this.updateServiceHealth('Supabase', 'ONLINE', Date.now() - start);
           }
        } else {
           this.updateServiceHealth('Supabase', 'NOT CONFIGURED', 0, 'Supabase credentials not configured');
        }
    } catch (error) {
         this.updateServiceHealth('Supabase', 'UNAVAILABLE', 0, error instanceof Error ? error.message : String(error));
    }

    // Check Market Data
    try {
       const start = Date.now();
       const key = getEnv("TWELVEDATA_API_KEY");
       if (key) {
           const controller = new AbortController();
           const timeout = setTimeout(() => controller.abort(), 3000);
           const res = await fetch(`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=1&apikey=${key}`, { signal: controller.signal });
           clearTimeout(timeout);
           const data = await res.json();
           if (data.code && data.status === 'error') {
               if (data.code === 429) {
                   this.updateServiceHealth('MarketData', 'RATE LIMITED', Date.now() - start, data.message);
               } else {
                   this.updateServiceHealth('MarketData', 'UNAVAILABLE', Date.now() - start, data.message);
               }
           } else {
               this.updateServiceHealth('MarketData', 'ONLINE', Date.now() - start);
           }
       } else {
           this.updateServiceHealth('MarketData', 'NOT CONFIGURED', 0, 'Pending API Key');
       }
    } catch (e: any) {
       this.updateServiceHealth('MarketData', 'UNAVAILABLE', 0, e.message);
    }

    // Check Economic Calendar
    try {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { 
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });
        clearTimeout(timeout);
        if (res.ok) {
            this.updateServiceHealth('EconomicCalendar', 'ONLINE', Date.now() - start);
        } else {
            if (res.status === 429) {
                this.updateServiceHealth('EconomicCalendar', 'RATE LIMITED', Date.now() - start, `HTTP ${res.status}`);
            } else {
                this.updateServiceHealth('EconomicCalendar', 'UNAVAILABLE', Date.now() - start, `HTTP ${res.status}`);
            }
        }
    } catch (e: any) {
        this.updateServiceHealth('EconomicCalendar', 'UNAVAILABLE', 0, e.message);
    }

    // Check Gemini AI
    try {
        const start = Date.now();
        const geminiKey = getEnv("GEMINI_API_KEY");
        if (geminiKey) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            if (data.error) {
                if (data.error.code === 429) {
                    this.updateServiceHealth('GeminiAI', 'RATE LIMITED', Date.now() - start, data.error.message);
                } else {
                    this.updateServiceHealth('GeminiAI', 'UNAVAILABLE', Date.now() - start, data.error.message);
                }
            } else {
                this.updateServiceHealth('GeminiAI', 'ONLINE', Date.now() - start);
            }
        } else {
            this.updateServiceHealth('GeminiAI', 'NOT CONFIGURED', 0, 'Missing Gemini API Key');
        }
    } catch (e: any) {
        this.updateServiceHealth('GeminiAI', 'UNAVAILABLE', 0, e.message);
    }
    
    // Check Telegram
    try {
        const start = Date.now();
        const token = getEnv("TELEGRAM_BOT_TOKEN");
        if (token) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            if (!data.ok) {
                if (data.error_code === 429) {
                    this.updateServiceHealth('TelegramBot', 'RATE LIMITED', Date.now() - start, data.description || 'Rate limited');
                } else {
                    this.updateServiceHealth('TelegramBot', 'UNAVAILABLE', Date.now() - start, data.description || 'Invalid token');
                }
            } else {
                this.updateServiceHealth('TelegramBot', 'ONLINE', Date.now() - start);
            }
        } else {
            this.updateServiceHealth('TelegramBot', 'NOT CONFIGURED', 0, 'Missing Telegram Bot Token');
        }
    } catch (e: any) {
        this.updateServiceHealth('TelegramBot', 'UNAVAILABLE', 0, e.message);
    }

    // Check Python Engine
    try {
        const start = Date.now();
        const defaultPyPort = process.env.PYTHON_PORT || '8181';
        const pyUrl = getEnv("PYTHON_ENGINE_URL") || `http://127.0.0.1:${defaultPyPort}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${pyUrl}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            this.updateServiceHealth('PythonEngine', 'ONLINE', Date.now() - start);
        } else {
            this.updateServiceHealth('PythonEngine', 'OFFLINE', Date.now() - start, `HTTP ${res.status}`);
        }
    } catch (e: any) {
        this.updateServiceHealth('PythonEngine', 'OFFLINE', 0, e.message.includes('missing') ? 'PYTHON_ENGINE_URL is missing' : 'Python service unreachable');
    }

    const servicesList = Object.values(this.services);
    
    // Determine overall status
    let overallStatus: ServiceHealthStatus = 'ONLINE';
    if (servicesList.some(s => s.status === 'OFFLINE' || s.status === 'UNAVAILABLE')) overallStatus = 'DEGRADED';
    else if (servicesList.some(s => s.status === 'RATE LIMITED')) overallStatus = 'RATE LIMITED';
    else if (servicesList.some(s => s.status === 'DEGRADED')) overallStatus = 'DEGRADED';
    else if (servicesList.some(s => s.status === 'NOT CONFIGURED')) overallStatus = 'NOT CONFIGURED';

    return {
      status: overallStatus,
      services: servicesList,
      timestamp: new Date().toISOString()
    };
  }
}

export const healthCheckEngine = new HealthCheckEngine();
