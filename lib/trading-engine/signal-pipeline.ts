import { getQueueManager } from '../redis/queue';
import { RuleResult, Signal } from '@/types';
import { StrategyState } from './state-machine';
import { AIValidationOrchestrator, ValidationPipelineResult } from './validation-pipeline/ai-orchestrator';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { notificationEngine } from '../notifications/notification-engine';
import { getSupabaseClient } from '../supabase/client';
import { PerformanceMonitor, AIMonitor } from '../mcp/engines/observability';
import { riskEngine } from '../risk-management/risk-engine';
import { metricsEngine } from '../observability/metrics-engine';

import { consistencyEngine } from './validation-pipeline/consistency-engine';
import { qualityGate } from './validation-pipeline/quality-gate';

export class SignalPipeline {
  private aiValidator: AIValidationOrchestrator;
  private recentNotifications: Map<string, number>; // For cooldown
  private dailyTradeCount: number = 0; // simplistic local counter for anti-overtrade

  constructor() {
    this.aiValidator = new AIValidationOrchestrator();
    this.recentNotifications = new Map();
  }

  public async processStateTransition(
    strategyId: string,
    prevState: StrategyState,
    newState: StrategyState,
    ruleResults: Record<string, RuleResult>,
    marketContext: any
  ) {
    const startTime = Date.now();
    const lockKey = `${strategyId}_${marketContext?.symbol || 'UNKNOWN'}`;
    
    // Distributed In-flight lock deduplication
    const lockAcquired = await getQueueManager().acquireLock(lockKey, 30);
    if (!lockAcquired) {
      logger.warn(`State transition for ${lockKey} is already in-flight (Distributed Lock). Suppressing duplicate.`);
      return;
    }
    
    try {
      logger.info(`Pipeline processing transition for ${strategyId}: ${prevState?.stateName || 'NONE'} -> ${newState.stateName}`);

      
      // Save state transition to DB
      await getSupabaseClient().insertStrategyState({
        strategy_id: strategyId, 
        symbol: marketContext?.symbol || 'XAUUSD',
        timeframe: marketContext?.timeframe || 'M15',
        state_name: newState.stateName,
        state_status: newState.currentStatus,
        signal_key: newState.signalKey || null,
        payload_json: { ruleResults, context: newState.context, correlationId: marketContext?.correlationId },
        reason: newState.reason
      });

      if (newState.signalKey) {
        await getSupabaseClient().updateSignalState(newState.signalKey, newState.stateName);
      }
      
      // Notify SSE clients
      getQueueManager().publish('events', { type: 'STRATEGY_TRANSITION', strategyId, state: newState.stateName });
      
      // If we reached WAIT_AI, trigger async AI Validation
      if (newState.stateName === 'WAIT_AI') {
        logger.info(`Triggering AI Validation for ${strategyId}`);
        
        // --- 1. ASYNC AI VALIDATION ---
        // Do not await to avoid blocking the pipeline thread
        this.runAIValidation(strategyId, newState, ruleResults, marketContext).catch(err => {
          logger.error(`Async AI Validation failed: ${err.message}`);
          metricsEngine.recordSignalProcessed(false, true);
        });
      }
      
      // If the state is SIGNAL_ACTIVE, handle publishing
      if (newState.stateName === 'SIGNAL_ACTIVE') {
        this.publishSignal(strategyId, newState, marketContext);
      }

      // If FINISHED, REJECTED, EXPIRED, move to history
      if (['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(newState.stateName)) {
        this.archiveSignal(strategyId, newState, marketContext);
      }
    } catch (e: any) {
      metricsEngine.recordSignalProcessed(false, true);
      throw e;
    } finally {
      await getQueueManager().releaseLock(lockKey);
      const execTime = Date.now() - startTime;
      const perf = PerformanceMonitor.evaluate(execTime);
      if (perf.status === 'warning') logger.warn(perf.message || 'Pipeline performance warning');
    }
  }

  private async runAIValidation(
    strategyId: string,
    state: StrategyState,
    ruleResults: Record<string, RuleResult>,
    marketContext: any
  ) {
    const aiStart = Date.now();
    const aiResult = await this.aiValidator.runPipeline(strategyId, state, ruleResults, marketContext);
    
    const aiLatency = Date.now() - aiStart;
    metricsEngine.recordAiValidationLatency(aiLatency);
    const aiMon = AIMonitor.evaluate(aiLatency, 0);
    if (aiMon.status !== 'healthy') logger.warn(`AI Monitor: ${aiMon.reason}`);

    logger.info(`AI Validation result for ${strategyId}: ${aiResult.decision}  - ${aiResult.reasoning}`);
    
    // Save to Audit Engine
    import('../observability/audit-logger').then(({ auditLogger }) => {
      auditLogger.logSignalAudit({
        signalId: state.signalKey || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        strategyVersion: '1.0', // hardcoded for now, can be dynamic
        ruleEngineVersion: '1.0',
        validatorVersion: '1.0',
        marketDataProvider: marketContext?.provider || 'multiple',
        dataSnapshot: marketContext?.candles?.length ? marketContext.candles[marketContext.candles.length - 1] : null,
        ruleChecklist: aiResult.checklist,
        evidence: { riskNotes: aiResult.riskNotes, missingFactors: aiResult.missingFactors },
        decision: aiResult.decision,
        reason: aiResult.reasoning,
        executionTimeMs: aiLatency
      });
    });

    // Next step based on AI decision
    if (aiResult.decision === 'APPROVED') {
       logger.info(`AI approved setup for ${strategyId}. Transitioning to SIGNAL_ACTIVE.`);
       await this.handleAIApproval(strategyId, state, ruleResults, aiResult, marketContext);
    } else if (aiResult.decision === 'REJECTED' || aiResult.decision === 'INVALIDATED' || aiResult.decision === 'FAILED') {
       logger.info(`AI rejected/failed setup for ${strategyId} (Decision: ${aiResult.decision}). Transitioning to REJECTED.`);
       this.handleAIRejection(strategyId, state, aiResult, marketContext);
    } else {
       logger.info(`AI pending for ${strategyId}. Awaiting further confirmation.`);
    }
  }

  private async handleAIApproval(strategyId: string, state: StrategyState, ruleResults: Record<string, RuleResult>, aiResult: ValidationPipelineResult, marketContext: any) {
    const signalKey = state.signalKey || crypto.randomUUID();
    
    // --- Consistency Engine Check ---
    const consistencyDecision = await consistencyEngine.evaluate(strategyId, state, ruleResults, aiResult, marketContext);
    if (consistencyDecision.status === 'block') {
        logger.warn(`Signal blocked by Consistency Engine for ${strategyId}. Reason: ${consistencyDecision.reasoning}`);
        this.handleAIRejection(strategyId, state, { strategyName: strategyId, decision: 'REJECTED', checklist: aiResult.checklist, reasoning: `Blocked by Consistency Engine: ${consistencyDecision.reasoning}`, riskNotes: consistencyDecision.conflicts.join(', '), missingFactors: [], recommendedAction: 'wait' }, marketContext);
        metricsEngine.recordSignalProcessed(true, false);
        return;
    }

    // --- 3. RISK ENGINE CHECK (Post-AI Approval) ---
    const riskContext = {
        strategyId: strategyId,
        symbol: marketContext?.symbol || 'XAUUSD',
        timeframe: marketContext?.timeframe || 'M15',
        entryPrice: state.context?.entryPrice,
        stopLoss: state.context?.slPrice,
        takeProfit: state.context?.tp1Price,
        newsWindow: marketContext?.news?.some((n: any) => n.impact === 'high'),
        accountBalance: 1000 // Base assumed balance for risk calculations
    };
    
    const riskDecision = await riskEngine.evaluateRisk(riskContext);
    
    if (['block', 'suppress', 'kill_switch'].includes(riskDecision.status)) {
        logger.warn(`Signal suppressed by Risk Engine for ${strategyId} AFTER AI approval. Reason: ${riskDecision.reason}`);
        this.handleAIRejection(strategyId, state, { strategyName: strategyId, decision: 'REJECTED', checklist: aiResult.checklist, reasoning: `AI Approved but Risk Guard Rejected: ${riskDecision.reason}`, riskNotes: riskDecision.reason, missingFactors: [], recommendedAction: 'wait' }, marketContext);
        metricsEngine.recordSignalProcessed(true, false);
        return;
    }

    // --- Quality Gate (Final Check) ---
    const qgDecision = await qualityGate.evaluate(strategyId, state, marketContext, ruleResults, aiResult, consistencyDecision, riskDecision);
    if (!qgDecision.passed) {
        logger.warn(`Signal blocked by Quality Gate for ${strategyId}. Reason: ${qgDecision.reason}`);
        this.handleAIRejection(strategyId, state, { strategyName: strategyId, decision: 'REJECTED', checklist: aiResult.checklist, reasoning: `Quality Gate Rejected: ${qgDecision.reason}`, riskNotes: '', missingFactors: [], recommendedAction: 'wait' }, marketContext);
        metricsEngine.recordSignalProcessed(true, false);
        return;
    }

    // Save position size back to context if allowed
    if (riskDecision.suggestedPositionSize) {
       if (!state.context) state.context = {};
       state.context.positionSize = riskDecision.suggestedPositionSize;
    }

    // Increment daily trade counter
    this.dailyTradeCount++;

    const liveSignal: Signal = {
      signalKey,
      correlationId: marketContext?.correlationId,
      strategyId,
      symbol: marketContext?.symbol || 'XAUUSD',
      timeframe: marketContext?.timeframe || 'M15',
      session: marketContext?.session || 'UNKNOWN',
      direction: state.context?.direction || 'buy',
      entryPrice: state.context?.entryPrice || 0,
      slPrice: state.context?.slPrice || 0,
      tp1Price: state.context?.tp1Price || 0,
      tp2Price: state.context?.tp2Price || 0,
      tp3Price: state.context?.tp3Price || 0,
      aiDecision: aiResult.decision,
      aiChecklist: aiResult.checklist,
      aiReasoning: aiResult.reasoning,
      aiEvidence: aiResult.aiReview?.evidence,
      aiRulesChecked: aiResult.aiReview?.rulesChecked,
      aiRulesPassed: aiResult.aiReview?.rulesPassed,
      aiRulesFailed: aiResult.aiReview?.rulesFailed,
      aiConflicts: aiResult.aiReview?.conflicts,
      status: 'SIGNAL_ACTIVE',
      createdAt: new Date().toISOString()
    };

    logger.info(`Generating live signal record: ${JSON.stringify(liveSignal)}`);
    getSupabaseClient().insertSignal(liveSignal)
      .then(() => {
        // Publish state transition so in-memory engine instances can update
        getQueueManager().publish('events', { type: 'STRATEGY_TRANSITION', strategyId, state: 'SIGNAL_ACTIVE' });
        
        // Save rule evidence for auditing
        if (ruleResults) {
          Object.values(ruleResults).forEach(rule => {
             getSupabaseClient().insertSignalEvidence({
                signal_key: signalKey,
                engine_name: 'rule_engine',
                evidence_type: 'rule_result',
                details: rule.evidence || {},
                passed: rule.status === 'valid',
                reason: rule.ruleId
             }).catch(e => logger.error(`Failed to insert evidence for ${rule.ruleId}: ${e.message}`));
          });
        }
        if (aiResult.aiReview) {
          getSupabaseClient().insertSignalEvidence({
             signal_key: signalKey,
             engine_name: 'ai_validation',
             evidence_type: 'ai_review',
             details: aiResult.aiReview,
             passed: aiResult.decision === 'APPROVED',
             reason: aiResult.reasoning
          }).catch(e => logger.error(`Failed to insert AI Review evidence: ${e.message}`));
        }
        if (aiResult.checklist && aiResult.checklist.length > 0) {
          aiResult.checklist.forEach(item => {
             getSupabaseClient().insertSignalEvidence({
                signal_key: signalKey,
                engine_name: 'validation_pipeline',
                evidence_type: 'checklist_item',
                details: { 
                   rule: item.rule, 
                   evidence: item.evidence
                },
                passed: item.status === 'PASS',
                reason: item.reason
             }).catch(e => logger.error(`Failed to insert checklist evidence: ${e.message}`));
          });
        }
      })
      .catch(e => logger.error('Failed to insert signal: ' + e.message));
    
    this.publishSignal(strategyId, { ...state, stateName: 'SIGNAL_ACTIVE', signalKey }, marketContext, aiResult.checklist, aiResult.reasoning);
  }

  private handleAIRejection(strategyId: string, state: StrategyState, _aiResult: ValidationPipelineResult, marketContext?: any) {
    const newStateName = 'REJECTED';
    getSupabaseClient().insertStrategyState({
        strategy_id: strategyId, 
        symbol: marketContext?.symbol || 'XAUUSD',
        timeframe: marketContext?.timeframe || 'M15',
        state_name: newStateName,
        state_status: 'rejected',
        signal_key: state.signalKey || null,
        payload_json: { context: state.context, correlationId: marketContext?.correlationId },
        reason: _aiResult.reasoning || 'AI Rejected'
    }).catch(e => logger.error(`Failed to insert rejected state: ${e.message}`));
    
    getQueueManager().publish('events', { type: 'STRATEGY_TRANSITION', strategyId, state: newStateName });
    this.archiveSignal(strategyId, { ...state, stateName: newStateName }, marketContext);
  }

  private publishSignal(strategyId: string, state: StrategyState, marketContext?: any, checklist?: any[], reasoning?: string) {
    const signalKey = state.signalKey || crypto.randomUUID();
    logger.info(`Publishing live signal ${signalKey} for ${strategyId}`);
    
    metricsEngine.recordSignalProcessed(false, false);
    
    this.notifyNewSignal(strategyId, signalKey, state, marketContext, checklist, reasoning);
    getQueueManager().publish('events', { type: 'SIGNAL_PUBLISHED', signalKey });
  }

  private archiveSignal(strategyId: string, state: StrategyState, marketContext?: any) {
    logger.info(`Archiving signal for ${strategyId}, final state: ${state.stateName}`);
    if (state.signalKey) {
      // Determine outcome (basic logic based on state)
      const outcome = state.stateName === 'FINISHED' ? 'WIN' : (state.stateName === 'REJECTED' ? 'LOSS' : 'UNKNOWN');
      const pipsResult = state.context?.pipsRealized || 0;
      
      getSupabaseClient().archiveToHistory(state.signalKey, state.stateName, pipsResult, outcome, marketContext?.correlationId)
        .catch(e => logger.error('Failed to archive: ' + e.message));
      getQueueManager().publish('events', { type: 'SIGNAL_ARCHIVED', signalKey: state.signalKey, status: state.stateName });
    }
  }
  
  private notifyNewSignal(strategyId: string, signalKey: string, state: StrategyState, marketContext?: any, checklist: any[] = [], reasoning: string = '') {
    const now = Date.now();
    const lastNotified = this.recentNotifications.get(strategyId) || 0;
    const COOLDOWN_MS = 60000; // 1 minute cooldown per strategy
    
    if (now - lastNotified < COOLDOWN_MS) {
      logger.info(`Notification suppressed for ${strategyId} (cooldown active).`);
      return;
    }
    
    this.recentNotifications.set(strategyId, now);
    logger.info(`Sending notification for new signal: ${signalKey} on strategy ${strategyId}`);
    
    const chartData = marketContext?.candles?.slice(-50).map((c: any) => c.close) || [];
    
    // Use NotificationEngine
    notificationEngine.notifyNewSignal({
       signal_key: signalKey,
      correlationId: marketContext?.correlationId,
       strategyName: strategyId,
       symbol: marketContext?.symbol || 'XAUUSD',
       direction: state.context?.direction === 'buy' ? 'LONG' : 'SHORT',
       entry: state.context?.entryPrice || 0,
       sl: state.context?.slPrice || 0,
       tp: [state.context?.tp1Price || 0, state.context?.tp2Price || 0, state.context?.tp3Price || 0].filter(t => t > 0),
       checklist: checklist,
       reason: reasoning || 'Strategy condition met',
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

