import { RuleEvaluationContext } from '../rule-engine';
import { BaseStrategy } from './base-strategy';
import { RuleEngine } from '../rule-engine';

export class Strategy3_ScalpingSMC extends BaseStrategy {
  public id = 'strategy-3';
  public name = 'Scalping SMC + Liquidity Sweep';

  constructor(ruleEngine: RuleEngine) {
    super(ruleEngine, 'strategy-3');
  }

  evaluate(context: RuleEvaluationContext): void {
    const currentState = this.stateMachine.getCurrentState();

    if (['WAIT_RETRACEMENT', 'WAIT_SWEEP', 'WAIT_PATTERN', 'WAIT_NECKLINE_BREAK', 'WAIT_AI'].includes(currentState)) {
      const trendRes = this.ruleEngine.evaluateTrend(context, 'M15');
      if (trendRes.status === 'invalid') {
         this.stateMachine.transition('REJECTED', 'M15 Trend invalidated');
         return;
      }
    }

    switch (currentState) {
      case 'IDLE':
        this.stateMachine.transition('WAIT_TREND', 'Initialized');
        break;
      case 'WAIT_TREND': {
        const res = this.ruleEngine.evaluateTrend(context, 'M15');
        this.lastRuleResults['rule_trend'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_RETRACEMENT', 'Trend confirmed');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Missing M15 trend candles');
        }
        break;
      }
      case 'WAIT_RETRACEMENT': {
        // We'll reuse liquidity level evaluation here loosely for the retracement leg
        const res = this.ruleEngine.evaluateLiquidityLevel(context);
        this.lastRuleResults['rule_level_liquidity'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_SWEEP', 'Retracement identified');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Not enough candles for retracement');
        }
        break;
      }
      case 'WAIT_SWEEP': {
        const res = this.ruleEngine.evaluateLiquiditySweep(context);
        this.lastRuleResults['rule_sweep'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_PATTERN', 'Liquidity swept');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate sweeps');
        }
        break;
      }
      case 'WAIT_PATTERN': {
        const trendRes = this.lastRuleResults['rule_trend'];
        const direction = trendRes?.evidence?.trend === 'bearish' ? 'sell' : 'buy';
        const expectedPattern = direction === 'buy' ? 'double_bottom' : 'double_top';
        
        const res = this.ruleEngine.evaluateChartPattern(context, expectedPattern);
        this.lastRuleResults['rule_pattern'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_NECKLINE_BREAK', 'Pattern formed');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate pattern');
        }
        break;
      }
      case 'WAIT_NECKLINE_BREAK': {
        const res = this.ruleEngine.evaluateNecklineBreak(context);
        this.lastRuleResults['rule_neckline'] = res;
        if (res.status === 'valid') {
          const trendRes = this.lastRuleResults['rule_trend'];
          const direction = trendRes?.evidence?.trend === 'bearish' ? 'sell' : 'buy';
          
          const candles = context.candles || context.marketData?.candles || [];
          const curr = candles[candles.length - 1];
          if (!curr) {
             this.stateMachine.transition('REJECTED', 'Candle data missing');
             return;
          }
          
          const entryPrice = curr.close;
          
          // Pattern provides extreme levels (highs/lows of the pattern)
          // Evaluate structure break returns pivoted highs/lows
          // We can use the sweep level for SL
          const sweepRes = this.lastRuleResults['rule_sweep'];
          const recentSweep = sweepRes?.evidence?.sweep || sweepRes?.evidence?.sweeps?.[sweepRes?.evidence?.sweeps?.length - 1];
          
          if (!recentSweep) {
             this.stateMachine.transition('REJECTED', 'Sweep data missing for SL placement');
             return;
          }
          
          const pipBuffer = 0.50; // 5 pips
          const slPrice = direction === 'buy' ? recentSweep.price - pipBuffer : recentSweep.price + pipBuffer;
          
          const risk = Math.abs(entryPrice - slPrice);
          const tp1Price = direction === 'buy' ? entryPrice + (risk * 2) : entryPrice - (risk * 2);
          
          this.stateMachine.transition('WAIT_AI', 'Neckline broken, awaiting AI', undefined, {
            direction, entryPrice, slPrice, tp1Price
          });
        } else if (res.status === 'invalid') {
           this.stateMachine.transition('REJECTED', 'Weak neckline break');
        }
        break;
      }
    }
  }
}
