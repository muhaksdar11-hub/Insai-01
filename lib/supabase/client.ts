import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private currentUrl: string = '';
  private currentKey: string = '';
  
  private failures: number = 0;
  private circuitOpen: boolean = false;
  private readonly maxFailures = 5;

  public getClient(): SupabaseClient | null {
    const rawSupabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL") || '';
    const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || '';

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    if (this.currentUrl === supabaseUrl && this.currentKey === supabaseKey && this.client) {
      return this.client;
    }

    try {
      new URL(supabaseUrl);
      this.client = createClient(supabaseUrl, supabaseKey, {
         auth: { persistSession: false },
         global: {
           fetch: (url, options) => {
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
             return fetch(url, { ...options, signal: controller.signal as any })
               .finally(() => clearTimeout(timeoutId));
           }
         }
      });
      this.currentUrl = supabaseUrl;
      this.currentKey = supabaseKey;
      this.failures = 0;
      this.circuitOpen = false;
      return this.client;
    } catch (e: any) {
      logger.warn(`Invalid Supabase configuration: ${e.message}. Supabase will be disabled.`);
      return null;
    }
  }

  public isConnected() {
    return this.getClient() !== null && !this.circuitOpen;
  }

  private async withRetry<T>(operation: () => Promise<T>, retries: number = 2): Promise<T> {
    if (this.circuitOpen) {
      throw new Error("Supabase circuit breaker is open");
    }
    
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await operation();
        this.failures = 0; // reset on success
        return result;
      } catch (err: any) {
        if (err.message === "Supabase circuit breaker is open") throw err;
        
        if (i === retries) {
          this.failures++;
          if (this.failures >= this.maxFailures && !this.circuitOpen) {
            this.circuitOpen = true;
            logger.error(`Supabase circuit breaker opened after ${this.failures} failures`);
            setTimeout(() => {
               this.circuitOpen = false;
               this.failures = 0;
               logger.info('Supabase circuit breaker half-open');
            }, 30000); // 30s reset
          }
          throw err;
        }
        // exponential backoff
        await new Promise(res => setTimeout(res, Math.pow(2, i) * 500));
      }
    }
    throw new Error("Unreachable");
  }

  public async insertSignal(signal: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertSignal.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const payload = {
          signal_key: signal.signalKey,
          strategy_id: signal.strategyId,
          symbol: signal.symbol,
          session: signal.session,
          timeframe: signal.timeframe,
          direction: signal.direction,
          entry_price: signal.entryPrice,
          sl_price: signal.slPrice,
          tp1_price: signal.tp1Price,
          tp2_price: signal.tp2Price,
          tp3_price: signal.tp3Price,
          ai_decision: signal.aiDecision,
          ai_reasoning: signal.aiReasoning,
          status: signal.status,
          correlation_id: signal.correlationId
        };
        const { data, error } = await supabase.from('signals').upsert([payload], { onConflict: 'signal_key' }).select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      logger.error(`Supabase insert error: ${err.message}`);
      return null;
    }
  }

  public async insertSignalEvidence(payload: { signal_key: string, engine_name: string, evidence_type: string, details: any, passed: boolean, reason: any }) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertSignalEvidence.');
      return null;
    }
    try {
      const { data, error } = await supabase
        .from('signal_evidence')
        .insert([{
           signal_key: payload.signal_key,
           engine_name: payload.engine_name,
           evidence_type: payload.evidence_type,
           details: payload.details,
           passed: payload.passed,
           reason: payload.reason
        }])
        .select();
      if (error) {
         logger.error(`Supabase insert signal evidence error (ignoring to prevent CB trip): ${error.message}`);
         return null;
      }
      return data;
    } catch (err: any) {
      logger.error(`Supabase insert signal evidence error: ${err.message}`);
      return null;
    }
  }

  public async updateSignalState(signalKey: string, state: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping updateSignalState.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('signals')
          .update({ status: state })
          .eq('signal_key', signalKey)
          .select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      logger.error(`Supabase update error: ${err.message}`);
      return null;
    }
  }

  public async insertAlert(alert: any) {
    const supabase = this.getClient();
    if (!supabase) return null;
    try {
      await this.withRetry(async () => {
        await supabase.from('alerts').insert([{
            alert_key: alert.alert_key,
            severity: alert.severity,
            target: alert.component,
            message: alert.message,
            payload_json: alert.details
        }]);
      });
    } catch (e: any) {
        logger.error(`Supabase insert alert error: ${e.message}`);
    }
  }

  public async archiveToHistory(signalKey: string, finalState: string, pipsResult: number = 0, outcome: string = 'UNKNOWN', correlationId?: string) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping archiveToHistory.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data: signalData, error: fetchError } = await supabase
          .from('signals')
          .select('*')
          .eq('signal_key', signalKey)
          .single();
          
        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
        if (!signalData) throw new Error('Signal not found');

        const historyRecord = { 
           signal_key: signalData.signal_key,
           strategy_id: signalData.strategy_id,
           symbol: signalData.symbol,
           status: finalState,
           outcome: outcome,
           pips_result: pipsResult,
           rr_realized: 0,
           reason: finalState,
           correlation_id: correlationId || signalData.correlation_id,
           closed_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase.from('history').insert(historyRecord);
        if (insertError) throw insertError;
        
        const { error: updateError } = await supabase
          .from('signals')
          .update({ status: finalState })
          .eq('signal_key', signalKey);
        if (updateError) throw updateError;
          
        return historyRecord;
      });
    } catch (err: any) {
      logger.error(`Supabase archive to history error: ${err.message}`);
      return null;
    }
  }

  public async getActiveSignals() {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('signals')
          .select('*, signal_evidence(*)')
          .eq('status', 'SIGNAL_ACTIVE');
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      logger.error(`Supabase fetch active error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async getHistoricalSignals() {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('history')
          .select('*, signals(direction, entry_price, sl_price, tp1_price)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      logger.error(`Supabase fetch history error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async getStrategyState(strategyId: string) {
    const supabase = this.getClient();
    if (!supabase) {
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('strategy_states')
          .select('*')
          .eq('strategy_id', strategyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      });
    } catch (err: any) {
      logger.error(`Supabase fetch strategy state error: ${err.message} (URL: ${this.currentUrl})`);
      return null;
    }
  }

  public async insertStrategyState(payload: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertStrategyState.');
      return null;
    }
    try {
      const { data, error } = await supabase
        .from('strategy_states')
        .insert([{
           strategy_id: payload.strategy_id,
           symbol: payload.symbol,
           timeframe: payload.timeframe,
           state_name: payload.state_name,
           state_status: payload.state_status,
           signal_key: payload.signal_key,
           payload_json: payload.payload_json,
           reason: payload.reason
        }])
        .select()
        .single();
      if (error) {
        logger.error(`Supabase insert strategy state error (ignoring to prevent CB trip): ${error.message}`);
        return null;
      }
      return data;
    } catch (err: any) {
      logger.error(`Supabase insert strategy state error: ${err.message}`);
      return null;
    }
  }

  public async getStrategies() {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('strategies')
          .select('*');
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          description: row.description || row.config?.description || '',
          status: row.status || (row.enabled ? 'active' : 'inactive'),
          parameters: row.config || {},
          enabled: row.enabled
        }));
      });
    } catch (err: any) {
      logger.error(`Supabase fetch strategies error: ${err.message} (URL: ${this.currentUrl})`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async getAuditLogs(limit: number = 50) {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      logger.error(`Supabase fetch audit logs error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async insertAuditLog(payload: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertAuditLog.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('audit_logs')
          .insert([{
             actor: payload.actor,
             actor_id: payload.actor_id,
             action: payload.action,
             entity_type: payload.entity_type,
             entity_id: payload.entity_id,
             payload_json: payload.payload_json
          }])
          .select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      logger.error(`Supabase insert audit log error: ${err.message}`);
      return null;
    }
  }

  public async upsertMCPService(payload: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping upsertMCPService.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('mcp_services')
          .upsert([{
             name: payload.name,
             category: payload.category,
             purpose: payload.purpose,
             source_type: payload.source_type,
             status: payload.status,
             health_status: payload.health_status,
             dependency: payload.dependency,
             fallback_status: payload.fallback_status,
             last_error: payload.last_error,
             notes: payload.notes
          }], { onConflict: 'name' })
          .select()
          .single();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      logger.error(`Supabase upsert MCP error: ${err.message}`);
      return null;
    }
  }

  public async getMCPServices() {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('mcp_services')
          .select('*')
          .order('category', { ascending: true })
          .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      logger.error(`Supabase fetch MCPs error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async findSimilarHistory(embedding: number[], threshold: number = 0.7, limit: number = 5) {
    const supabase = this.getClient();
    if (!supabase) return [];
    try {
        const { data, error } = await supabase.rpc('match_history_signals', {
            query_embedding: embedding,
            match_threshold: threshold,
            match_count: limit
        });
        if (error) {
            logger.warn('Failed to fetch similar history', { error: error.message });
            return [];
        }
        return data || [];
    } catch (e) {
        logger.warn('Exception fetching similar history', { error: e });
        return [];
    }
  }

}

let _supabaseClient: SupabaseService | null = null;
export function getSupabaseClient(): SupabaseService {
  if (!_supabaseClient) _supabaseClient = new SupabaseService();
  return _supabaseClient;
}

  