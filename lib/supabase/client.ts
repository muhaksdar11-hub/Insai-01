import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private currentUrl: string = '';
  private currentKey: string = '';

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
      this.client = createClient(supabaseUrl, supabaseKey);
      this.currentUrl = supabaseUrl;
      this.currentKey = supabaseKey;
      return this.client;
    } catch (e: any) {
      logger.warn(`Invalid Supabase configuration: ${e.message}. Supabase will be disabled.`);
      return null;
    }
  }

  public isConnected() {
    return this.getClient() !== null;
  }

  public async insertSignal(signal: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertSignal.');
      return null;
    }
    try {
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
      const { data, error } = await supabase.from('signals').insert([payload]).select();
      if (error) throw error;
      return data;
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
        .insert([payload])
        .select();
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('signals')
        .update({ status: state })
        .eq('signal_key', signalKey)
        .select();
      if (error) throw error;
      return data;
    } catch (err: any) {
      logger.error(`Supabase update error: ${err.message}`);
      return null;
    }
  }

  public async insertAlert(alert: any) {
    const supabase = this.getClient();
    if (!supabase) return null;
    try {
        await supabase.from('alerts').insert([{
            alert_key: alert.alert_key,
            severity: alert.severity,
            target: alert.component,
            message: alert.message,
            payload_json: alert.details,
            created_at: alert.timestamp
        }]);
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
      const { data, error } = await supabase
        .from('signals')
        .select('*, signal_evidence(*)')
        .eq('status', 'SIGNAL_ACTIVE');
      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('history')
        .select('*, signals(direction, entry_price, sl_price, tp1_price)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('strategy_states')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (err: any) {
      logger.error(`Supabase fetch strategy state error: ${err.message}`);
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
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('strategies')
        .select('*');
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.config?.description || '',
        status: row.is_active ? 'active' : 'inactive',
        parameters: row.config || {},
        enabled: row.is_active
      }));
    } catch (err: any) {
      logger.error(`Supabase fetch strategies error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async getAuditLogs(limit: number = 50) {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([payload])
        .select();
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('mcp_services')
        .upsert(payload, { onConflict: 'name' })
        .select()
        .single();
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('mcp_services')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err: any) {
      logger.error(`Supabase fetch MCPs error: ${err.message}`);
      return { status: 'error', available: false, reason: err.message };
    }
  }
}

let _supabaseClient: SupabaseService | null = null;
export function getSupabaseClient(): SupabaseService {
  if (!_supabaseClient) _supabaseClient = new SupabaseService();
  return _supabaseClient;
}
