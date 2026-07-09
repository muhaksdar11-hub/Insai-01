import { RuleEvaluationContext } from '../rule-engine';
import { BaseStrategy } from './base-strategy';
import { RuleEngine } from '../rule-engine';

export class Strategy2_SndEngulfing extends BaseStrategy {
  public id = 'strategy-2';
  public name = 'Supply & Demand + Engulfing';

  constructor(ruleEngine: RuleEngine) {
    super(ruleEngine, 'strategy-2');
  }

  evaluate(context: RuleEvaluationContext): void {
    const currentState = this.stateMachine.getCurrentState();

    if (['WAIT_LEVEL', 'WAIT_SWEEP', 'WAIT_CONFIRMATION', 'WAIT_AI'].includes(currentState)) {
      const trendRes = this.ruleEngine.evaluateTrend(context, 'H1');
      if (trendRes.status === 'invalid') {
         this.stateMachine.transition('REJECTED', 'H1 Trend invalidated');
         return;
      }
    }

    switch (currentState) {
      case 'IDLE':
        this.stateMachine.transition('WAIT_TREND', 'Initialized');
        break;
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
        const res = this.ruleEngine.evaluateSupplyDemandZone(context);
        this.lastRuleResults['rule_level_snd'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_SWEEP', 'SnD Zone identified');
        } else if (res.status === 'invalid') {
           this.stateMachine.transition('REJECTED', 'No SnD Zone identified');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Not enough candles for SnD Zone');
        }
        break;
      }
      case 'WAIT_SWEEP': {
        const res = this.ruleEngine.evaluateLiquiditySweep(context);
        this.lastRuleResults['rule_sweep'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_CONFIRMATION', 'Sweep at zone occurred');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate sweeps');
        }
        break;
      }
      case 'WAIT_CONFIRMATION': {
        const res = this.ruleEngine.evaluateEngulfing(context);
        this.lastRuleResults['rule_engulfing'] = res;
        if (res.status === 'valid') {
          const direction = res.evidence.engulfing === 'bearish_engulfing' ? 'sell' : 'buy';
          const candles = context.candles || context.marketData?.candles || [];
          const curr = candles[candles.length - 1];
          const prev = candles[candles.length - 2];
          
          if (!curr || !prev) {
             this.stateMachine.transition('REJECTED', 'Candle data missing for engulfing');
             return;
          }
          
          const entryPrice = curr.close;
          const pipBuffer = 0.50;
          
          // SL below/above the low/high of the engulfing pattern
          let slPrice = 0;
          if (direction === 'buy') {
             slPrice = Math.min(curr.low, prev.low) - pipBuffer;
          } else {
             slPrice = Math.max(curr.high, prev.high) + pipBuffer;
          }
          
          const risk = Math.abs(entryPrice - slPrice);
          const tp1Price = direction === 'buy' ? entryPrice + (risk * 2) : entryPrice - (risk * 2); // 1:2 RR for this strategy
          
          this.stateMachine.transition('WAIT_AI', 'Engulfing confirmed, awaiting AI', undefined, {
            direction, entryPrice, slPrice, tp1Price
          });
        } else if (res.status === 'invalid') {
          this.stateMachine.transition('REJECTED', 'Weak engulfing or no engulfing');
        }
        break;
      }
    }
  }
}
