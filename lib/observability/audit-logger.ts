import { getSupabaseClient } from '../supabase/client';
import { logger } from '../utils/logger';

export interface AuditLogEntry {
  action: string;
  entity: string;
  entity_id: string;
  status: 'success' | 'failure' | 'pending';
  details?: any;
}

export interface SignalAuditPayload {
  signalId: string;
  timestamp: string;
  strategyVersion: string;
  ruleEngineVersion: string;
  validatorVersion: string;
  marketDataProvider: string;
  dataSnapshot: any;
  ruleChecklist: any;
  evidence: any;
  decision: string;
  reason: string;
  executionTimeMs: number;
}

export class AuditLogger {
  public async log(entry: AuditLogEntry): Promise<void> {
    try {
      if (!getSupabaseClient().isConnected()) {
         // Supabase not configured or table missing, fallback to console logger
         logger.info(`[AUDIT FALLBACK] ${entry.action} on ${entry.entity}:${entry.entity_id} - ${entry.status}`, entry.details);
         return;
      }
      
      // Real insert logic
      await getSupabaseClient().insertAuditLog({
         action: entry.action,
         entity_type: entry.entity,
         entity_id: entry.entity_id,
         payload_json: {
           status: entry.status,
           details: entry.details
         },
         created_at: new Date().toISOString()
      });
      
      logger.info(`[AUDIT] ${entry.action} on ${entry.entity}:${entry.entity_id} - ${entry.status}`, entry.details);
    } catch (e) {
      logger.error('Error persisting audit log', { reason: e instanceof Error ? e.message : String(e) });
    }
  }

  public async logSignalAudit(payload: SignalAuditPayload): Promise<void> {
    try {
      if (!getSupabaseClient().isConnected()) {
        logger.info(`[SIGNAL AUDIT FALLBACK] Signal ${payload.signalId} decision: ${payload.decision} (${payload.reason})`);
        return;
      }

      await getSupabaseClient().insertAuditLog({
        action: 'SIGNAL_VALIDATION_AUDIT',
        entity_type: 'signal',
        entity_id: payload.signalId,
        payload_json: {
          status: payload.decision === 'APPROVED' ? 'success' : (payload.decision === 'REJECTED' || payload.decision === 'INVALIDATED' ? 'failure' : 'pending'),
          ...payload
        },
        created_at: payload.timestamp
      });

      logger.info(`[SIGNAL AUDIT] Signal ${payload.signalId} recorded. Decision: ${payload.decision}. Reason: ${payload.reason}`);
    } catch (e) {
      logger.error(`Error persisting signal audit log for ${payload.signalId}`, { reason: e instanceof Error ? e.message : String(e) });
    }
  }
}

export const auditLogger = new AuditLogger();
