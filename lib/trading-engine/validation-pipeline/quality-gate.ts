import { RuleResult } from '@/types';
import { StrategyState } from '../state-machine';
import { ValidationPipelineResult } from './ai-orchestrator';
import { ConsistencyResult } from './consistency-engine';
import { logger } from '../../utils/logger';
import { getSupabaseClient } from '../../supabase/client';

export interface QualityGateResult {
  passed: boolean;
  reason?: string;
  details?: any;
}

export class QualityGate {
  private readonly MAX_DATA_AGE_MS = 5 * 60 * 1000; // 5 minutes max data age
  private readonly MAX_SPREAD_PIPS = 3.0; // max 3 pips spread for XAUUSD (example)
  private readonly MIN_RR_RATIO = 1.0;

  public async evaluate(
    strategyId: string,
    state: StrategyState,
    marketContext: any,
    ruleResults: Record<string, RuleResult>,
    aiResult: ValidationPipelineResult,
    consistencyResult: ConsistencyResult,
    riskDecision: any
  ): Promise<QualityGateResult> {
    logger.info(`Evaluating Quality Gate for ${strategyId}`);
    
    // 1. Consistency Result Check
    if (consistencyResult.status === 'block') {
      return this.reject(`Blocked by Consistency Engine: ${consistencyResult.reasoning}`);
    }

    // 2. Risk Decision Check
    if (['block', 'suppress', 'kill_switch'].includes(riskDecision.status)) {
       return this.reject(`Blocked by Risk Engine: ${riskDecision.reason}`);
    }

    // 3. AI Validation Check
    if (aiResult.decision !== 'APPROVED') {
       return this.reject(`AI Validation not approved (${aiResult.decision}). Reason: ${aiResult.reasoning}`);
    }

    // 4. Rule Results Check
    // Rules are evaluated synchronously so they are only valid, invalid, or unknown.
    const rules = Object.values(ruleResults);
    if (rules.some(r => r.status === 'unknown')) {
       return this.reject(`Incomplete Validation: Not all rules have valid data.`);
    }

    // 5. Freshness Check (Market Data & Timestamp)
    const now = Date.now();
    const dataTimestamp = marketContext?.timestamp ? new Date(marketContext.timestamp).getTime() : 0;
    
    // If we have a timestamp, check if it's too old
    if (dataTimestamp > 0 && (now - dataTimestamp) > this.MAX_DATA_AGE_MS) {
       return this.reject(`Stale Market Data: Data is older than ${this.MAX_DATA_AGE_MS / 1000 / 60} minutes.`);
    }

    // Check if the signal is expired before it even gets published
    // (e.g. state transition took too long)
    const stateTransitionTime = state.timestamp ? new Date(state.timestamp).getTime() : now;
    if ((now - stateTransitionTime) > this.MAX_DATA_AGE_MS) {
       return this.reject(`Expired Signal: Pipeline processing took too long.`);
    }

    // 6. Spread Limit Check
    const spread = marketContext?.spread || 0;
    if (spread > this.MAX_SPREAD_PIPS) {
       return this.reject(`Spread Too High: Current spread (${spread}) exceeds max allowed (${this.MAX_SPREAD_PIPS}).`);
    }

    // 7. RR (Risk Reward) Ratio Check
    const entry = state.context?.entryPrice || 0;
    const sl = state.context?.slPrice || 0;
    const tp1 = state.context?.tp1Price || 0;
    
    if (entry && sl && tp1) {
       const risk = Math.abs(entry - sl);
       const reward = Math.abs(tp1 - entry);
       if (risk > 0) {
           const rr = reward / risk;
           if (rr < this.MIN_RR_RATIO) {
               return this.reject(`Poor Risk-Reward: Calculated RR (${rr.toFixed(2)}) is below minimum (${this.MIN_RR_RATIO}).`);
           }
       }
    }

    // 8. Duplicate / Active Signal Check
    // Prevent publishing if an active signal already exists for the same strategy and symbol
    const symbol = marketContext?.symbol || 'XAUUSD';
    try {
        const client = getSupabaseClient();
        if (client.isConnected()) {
             const activeResult = await client.getActiveSignals();
             const allActive = Array.isArray(activeResult) ? activeResult : (activeResult as any).data || [];
             const strategyActive = allActive.filter((s: any) => s.strategy_id === strategyId && s.symbol === symbol);
             if (strategyActive && strategyActive.length > 0) {
                 return this.reject(`Duplicate Active Signal: Strategy ${strategyId} already has an active signal for ${symbol}.`);
             }
        }
    } catch (e: any) {
        logger.warn(`Quality Gate failed to query active signals, proceeding with caution: ${e.message}`);
        // Do we reject or proceed? Let's be strict.
        // Wait, if Supabase is offline, the whole app might be running degraded. Let's not block completely on DB error, 
        // but normally we should. Let's block to be safe and deterministic.
        return this.reject(`Database Error: Could not verify existing active signals (${e.message}).`);
    }

    // Final Approval
    logger.info(`Quality Gate passed for ${strategyId}`);
    return {
      passed: true,
      reason: 'All quality gate checks passed',
      details: {
         spread,
         dataAgeMs: now - dataTimestamp,
         riskDecision: riskDecision.status
      }
    };
  }

  private reject(reason: string): QualityGateResult {
    logger.warn(`Quality Gate BLOCKED signal: ${reason}`);
    return {
      passed: false,
      reason
    };
  }
}

export const qualityGate = new QualityGate();
