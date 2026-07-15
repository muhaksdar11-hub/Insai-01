import { getQueueManager } from '../redis/queue';
import { Setup } from '@/types';
import { logger } from '../utils/logger';
import { notificationEngine } from '../notifications/notification-engine';
import { getSupabaseClient } from '../supabase/client';
import { metricsEngine } from '../observability/metrics-engine';
import crypto from 'crypto';

export class SignalPipeline {
  constructor() {
  }

  public async emitSignal(setup: Setup, marketContext: any) {
    const lockKey = `${setup.sourceStrategy}_${setup.symbol}_${setup.timeframe}`;
    
    // Distributed In-flight lock deduplication
    const lockAcquired = await getQueueManager().acquireLock(lockKey, 30);
    if (!lockAcquired) {
      logger.warn(`Signal generation for ${lockKey} is already in-flight (Distributed Lock). Suppressing duplicate.`);
      return;
    }

    try {
      logger.info(`Pipeline processing final setup signal for ${setup.id}`);

      const liveSignal = {
        signalKey: setup.id,
        correlationId: crypto.randomUUID(),
        strategyId: setup.sourceStrategy,
        symbol: setup.symbol,
        timeframe: setup.timeframe,
        session: marketContext?.session || 'UNKNOWN',
        direction: setup.direction || 'buy',
        entryPrice: setup.entryPrice || 0,
        slPrice: setup.slPrice || 0,
        tp1Price: setup.tpPrice || 0,
        tp2Price: 0,
        tp3Price: 0,
        aiDecision: (setup as any).aiValidation?.decision || 'APPROVED',
        aiReasoning: (setup as any).aiValidation?.reasoning || 'Deterministic Engine Match',
        aiEvidence: (setup as any).aiValidation?.evidence || '',
        status: ((setup as any).isSuppressed ? 'SUPPRESSED' : 'SIGNAL_ACTIVE') as any,
        createdAt: new Date().toISOString()
      };

      await getSupabaseClient().insertSignal(liveSignal);
      
      // Store AI Review Evidence if available
      const aiValidationData = (setup as any).aiValidation;
      if (aiValidationData) {
        await getSupabaseClient().insertSignalEvidence({
           signal_key: setup.id,
           engine_name: 'ai_validation',
           evidence_type: 'ai_review',
           details: aiValidationData,
           passed: aiValidationData.decision === 'APPROVED',
           reason: 'AI Validation Review'
        }).catch(e => logger.error(`Failed to insert AI evidence: ${e.message}`));
        
        // Insert checklist items
        if (aiValidationData.checklist && Array.isArray(aiValidationData.checklist)) {
          for (const item of aiValidationData.checklist) {
             getSupabaseClient().insertSignalEvidence({
               signal_key: setup.id,
               engine_name: 'validation_pipeline',
               evidence_type: 'checklist_item',
               details: item,
               passed: item.status === 'PASS',
               reason: item.reason || item.rule
             }).catch(e => logger.error(`Failed to insert checklist evidence: ${e.message}`));
          }
        }
      }

      // Store validation logs as evidence
      if (setup.validationLog && setup.validationLog.length > 0) {
        setup.validationLog.forEach(log => {
           getSupabaseClient().insertSignalEvidence({
              signal_key: setup.id,
              engine_name: 'setup_detector',
              evidence_type: 'lifecycle_log',
              details: { 
                 action: log.action,
                 details: log.details
              },
              passed: log.status === 'success',
              reason: log.action
           }).catch(e => logger.error(`Failed to insert evidence: ${e.message}`));
        });
      }

      getQueueManager().publish('events', { type: 'SIGNAL_PUBLISHED', signalKey: setup.id });

      this.notifyNewSignal(setup, marketContext);
      
      metricsEngine.recordSignalProcessed(false, false);

    } catch (e: any) {
      metricsEngine.recordSignalProcessed(false, true);
      throw e;
    } finally {
      await getQueueManager().releaseLock(lockKey);
    }
  }

  private async notifyNewSignal(setup: Setup, marketContext?: any) {
    if ((setup as any).isSuppressed) {
      logger.info(`Notification bypassed for suppressed signal: ${setup.id}`);
      return;
    }

    const COOLDOWN_SECONDS = 60; // 1 minute cooldown per strategy
    const dedupKey = `notification_cooldown_${setup.sourceStrategy}`;
    
    const isNew = await getQueueManager().deduplicate(dedupKey, COOLDOWN_SECONDS);
    if (!isNew) {
      logger.info(`Notification suppressed for ${setup.sourceStrategy} (distributed cooldown active).`);
      return;
    }
    
    logger.info(`Sending notification for new signal: ${setup.id} on strategy ${setup.sourceStrategy}`);
    
    const chartData = marketContext?.candles?.slice(-50).map((c: any) => c.close) || [];
    
    // Use NotificationEngine
    notificationEngine.notifyNewSignal({
       signal_key: setup.id,
       correlationId: crypto.randomUUID(),
       strategyName: setup.sourceStrategy,
       symbol: setup.symbol,
       direction: setup.direction === 'buy' ? 'LONG' : 'SHORT',
       entry: setup.entryPrice || 0,
       sl: setup.slPrice || 0,
       tp: [setup.tpPrice || 0],
       checklist: [],
       reason: 'Setup Deterministic Constraints Met',
       timestamp: new Date().toISOString(),
       status: 'queued',
       chartData
    }).then(() => {
        metricsEngine.recordNotification(true);
    }).catch(() => {
        metricsEngine.recordNotification(false);
    });
  }
}

