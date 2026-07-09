import { RuleResult } from '@/types';
import { StrategyState } from '../state-machine';
import { ValidationPipelineResult } from './ai-orchestrator';
import { logger } from '../../utils/logger';

export interface ConsistencyResult {
  status: 'pass' | 'block';
  reasoning: string;
  conflicts: string[];
}

export class ConsistencyEngine {
  public async evaluate(
    strategyId: string,
    state: StrategyState,
    ruleResults: Record<string, RuleResult>,
    aiResult: ValidationPipelineResult,
    marketContext: any
  ): Promise<ConsistencyResult> {
    logger.info(`Running Consistency Engine for ${strategyId}`);
    
    const conflicts: string[] = [];
    
    // 1. Check for contradictory indicators or rules
    // E.g., if trend is bullish but direction is short, or if momentum is bearish but direction is long.
    const direction = state.context?.direction || 'unknown';
    
    let hasBullishSignal = false;
    let hasBearishSignal = false;

    // Scan rule results
    for (const [ruleId, result] of Object.entries(ruleResults)) {
      if (result.status === 'unknown') {
        conflicts.push(`Rule ${ruleId} returned an unknown/invalid state`);
      }
      
      const evidenceStr = JSON.stringify(result.evidence || {}).toLowerCase();
      if (evidenceStr.includes('bullish') || evidenceStr.includes('long') || evidenceStr.includes('buy')) {
        hasBullishSignal = true;
      }
      if (evidenceStr.includes('bearish') || evidenceStr.includes('short') || evidenceStr.includes('sell')) {
        hasBearishSignal = true;
      }
    }

    // 2. Check direction vs market context
    if (direction === 'buy' && marketContext?.trend === 'bearish') {
       conflicts.push(`Contradiction: Strategy direction is BUY but market context trend is BEARISH.`);
    }
    if (direction === 'sell' && marketContext?.trend === 'bullish') {
       conflicts.push(`Contradiction: Strategy direction is SELL but market context trend is BULLISH.`);
    }

    // 3. Check AI Checklist consistency
    if (aiResult.checklist) {
       const failedRules = aiResult.checklist.filter(c => c.status === 'FAIL');
       if (failedRules.length > 0 && aiResult.decision === 'APPROVED') {
          conflicts.push(`Contradiction: AI approved the setup but ${failedRules.length} checklist items failed.`);
       }
    }

    // 4. Check for logic contradictions in evidence
    if (hasBullishSignal && hasBearishSignal && !['range', 'choppy'].includes(marketContext?.trend || '')) {
       // It's normal to have mixed signals, but if it's too conflicting and we are not in a range, flag it
       // Let's rely on explicit contradictions rather than loose keyword matching to prevent false positives.
       // E.g., if AI says bullish but rules say bearish
       const aiReasoning = aiResult.reasoning?.toLowerCase() || '';
       if (direction === 'buy' && aiReasoning.includes('strongly bearish')) {
          conflicts.push(`Contradiction: Direction is BUY but AI reasoning contains 'strongly bearish'.`);
       }
       if (direction === 'sell' && aiReasoning.includes('strongly bullish')) {
          conflicts.push(`Contradiction: Direction is SELL but AI reasoning contains 'strongly bullish'.`);
       }
    }

    // 5. Ensure Entry, SL, TP make sense logically
    const entry = state.context?.entryPrice;
    const sl = state.context?.slPrice;
    const tp1 = state.context?.tp1Price;

    if (entry && sl && tp1) {
        if (direction === 'buy') {
            if (sl >= entry) conflicts.push(`Contradiction: Buy setup has Stop Loss (${sl}) >= Entry (${entry}).`);
            if (tp1 <= entry) conflicts.push(`Contradiction: Buy setup has Take Profit 1 (${tp1}) <= Entry (${entry}).`);
        } else if (direction === 'sell') {
            if (sl <= entry) conflicts.push(`Contradiction: Sell setup has Stop Loss (${sl}) <= Entry (${entry}).`);
            if (tp1 >= entry) conflicts.push(`Contradiction: Sell setup has Take Profit 1 (${tp1}) >= Entry (${entry}).`);
        }
    } else {
        conflicts.push(`Missing critical price levels: Entry (${entry}), SL (${sl}), or TP1 (${tp1}).`);
    }

    // 6. Final Evaluation
    if (conflicts.length > 0) {
      logger.warn(`Consistency Engine found ${conflicts.length} conflicts: ${conflicts.join(' | ')}`);
      return {
        status: 'block',
        reasoning: `Consistency checks failed: ${conflicts[0]}`,
        conflicts
      };
    }

    logger.info(`Consistency Engine passed for ${strategyId}. No logical contradictions found.`);
    return {
      status: 'pass',
      reasoning: 'All consistency checks passed',
      conflicts: []
    };
  }
}

export const consistencyEngine = new ConsistencyEngine();
