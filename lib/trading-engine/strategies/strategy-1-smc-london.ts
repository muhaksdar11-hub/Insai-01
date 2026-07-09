import { RuleEvaluationContext } from '../rule-engine';
import { BaseStrategy } from './base-strategy';
import { RuleEngine } from '../rule-engine';

export class Strategy1_SMCLondon extends BaseStrategy {
  public id = 'strategy-1';
  public name = 'SMC + London Session + M15';

  constructor(ruleEngine: RuleEngine) {
    super(ruleEngine, 'strategy-1');
  }

  evaluate(context: RuleEvaluationContext): void {
    const currentState = this.stateMachine.getCurrentState();

    // Check invalidation for trend if we are past WAIT_TREND but not finished
    if (['WAIT_LEVEL', 'WAIT_SWEEP', 'WAIT_CONFIRMATION', 'WAIT_RETEST', 'WAIT_AI'].includes(currentState)) {
      const trendRes = this.ruleEngine.evaluateTrend(context, 'H1');
      if (trendRes.status === 'invalid') {
         this.stateMachine.transition('REJECTED', 'H1 Trend invalidated');
         return;
      }
    }

    switch (currentState) {
      case 'IDLE':
        this.stateMachine.transition('WAIT_SESSION', 'Initialized');
        break;
      case 'WAIT_SESSION': {
        const res = this.ruleEngine.evaluateSession(context, 'london');
        this.lastRuleResults['rule_session'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_TREND', 'London session active');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Session could not be parsed');
        }
        break;
      }
      case 'WAIT_TREND': {
        const res = this.ruleEngine.evaluateTrend(context, 'H1');
        this.lastRuleResults['rule_trend'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_LEVEL', 'H1 Trend confirmed');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Missing HTF trend candles');
        }
        break;
      }
      case 'WAIT_LEVEL': {
        const res = this.ruleEngine.evaluateLiquidityLevel(context);
        this.lastRuleResults['rule_level_liquidity'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_SWEEP', 'Liquidity level identified');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Not enough candles for Liquidity Levels');
        }
        break;
      }
      case 'WAIT_SWEEP': {
        const res = this.ruleEngine.evaluateLiquiditySweep(context);
        this.lastRuleResults['rule_sweep'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_CONFIRMATION', 'Liquidity sweep occurred');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate sweeps');
        }
        break;
      }
      case 'WAIT_CONFIRMATION': {
        const res = this.ruleEngine.evaluateStructureBreak(context);
        this.lastRuleResults['rule_choch'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_RETEST', 'CHoCH confirmed');
        } else if (res.status === 'invalid' && res.invalidations?.includes('Minor structure')) {
          this.stateMachine.transition('REJECTED', 'CHoCH minor structure invalidation');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate structure breaks');
        }
        break;
      }
      case 'WAIT_RETEST': {
        const res = this.ruleEngine.evaluateRetest(context);
        this.lastRuleResults['rule_retest'] = res;
        if (res.status === 'valid') {
          const trendRes = this.lastRuleResults['rule_trend'];
          const direction = trendRes?.evidence?.trend === 'bearish' ? 'sell' : 'buy';
          
          // Use actual FVG boundary for entry
          const recentFvg = res.evidence.fvg || res.evidence.retest?.[res.evidence.retest?.length - 1];
          if (!recentFvg) {
             this.stateMachine.transition('REJECTED', 'FVG data missing');
             return;
          }

          // In SMC, entry is usually at the FVG boundary, SL is beyond the extreme (sweep level)
          const entryPrice = direction === 'buy' ? recentFvg.top : recentFvg.bottom;
          
          // SL based on the FVG extreme or sweep level
          const sweepRes = this.lastRuleResults['rule_sweep'];
          const recentSweep = sweepRes?.evidence?.sweep || sweepRes?.evidence?.sweeps?.[sweepRes?.evidence?.sweeps?.length - 1];
          
          // If sweep found, use sweep price for SL, otherwise use the other side of FVG
          const slBase = recentSweep ? recentSweep.price : (direction === 'buy' ? recentFvg.bottom : recentFvg.top);
          
          const pipBuffer = 0.50; // 5 pips buffer for XAUUSD (since typical pricing is 2300.00)
          const slPrice = direction === 'buy' ? slBase - pipBuffer : slBase + pipBuffer;
          
          // TP based on a simple 1:3 RR from Entry to SL
          const risk = Math.abs(entryPrice - slPrice);
          const tp1Price = direction === 'buy' ? entryPrice + (risk * 3) : entryPrice - (risk * 3);
          
          this.stateMachine.transition('WAIT_AI', 'Retest confirmed, awaiting AI', undefined, {
            direction,
            entryPrice,
            slPrice,
            tp1Price
          });
        } else if (res.status === 'invalid') {
          // If no FVG forms, invalidate
          this.stateMachine.transition('REJECTED', 'No FVG for retest');
        }
        break;
      }
    }
  }
}
