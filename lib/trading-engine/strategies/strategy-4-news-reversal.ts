import { RuleEvaluationContext } from '../rule-engine';
import { BaseStrategy } from './base-strategy';
import { RuleEngine } from '../rule-engine';

export class Strategy4_NewsReversal extends BaseStrategy {
  public id = 'strategy-4';
  public name = 'News XAUUSD Reversal';

  constructor(ruleEngine: RuleEngine) {
    super(ruleEngine, 'strategy-4');
  }

  evaluate(context: RuleEvaluationContext): void {
    const currentState = this.stateMachine.getCurrentState();

    switch (currentState) {
      case 'IDLE':
        this.stateMachine.transition('WAIT_NEWS', 'Initialized');
        break;
      case 'WAIT_NEWS': {
        const res = this.ruleEngine.evaluateNewsImpact(context);
        this.lastRuleResults['rule_news'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_SWEEP', 'High impact news detected');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Missing news data');
        }
        break;
      }
      case 'WAIT_SWEEP': {
        const res = this.ruleEngine.evaluateLiquiditySweep(context);
        this.lastRuleResults['rule_sweep'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_REJECTION', 'News sweep occurred');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Cannot evaluate sweeps');
        }
        break;
      }
      case 'WAIT_REJECTION': {
        const res = this.ruleEngine.evaluateAggressiveRejection(context);
        this.lastRuleResults['rule_rejection'] = res;
        if (res.status === 'valid') {
          this.stateMachine.transition('WAIT_STRUCTURE', 'Aggressive rejection observed');
        } else if (res.status === 'invalid') {
          this.stateMachine.transition('REJECTED', 'No strong rejection wick after news sweep');
        } else if (res.status === 'unknown') {
           this.stateMachine.transition('REJECTED', 'Insufficient Data: Missing candles for rejection analysis');
        }
        break;
      }
      case 'WAIT_STRUCTURE': {
        const res = this.ruleEngine.evaluateStructureBreak(context);
        this.lastRuleResults['rule_choch'] = res;
        if (res.status === 'valid') {
          // Determine direction from structure break
          const direction = res.evidence.bullishChoch ? 'buy' : 'sell';
          const candles = context.candles || context.marketData?.candles || [];
          const curr = candles[candles.length - 1];
          if (!curr) {
             this.stateMachine.transition('REJECTED', 'Candle data missing');
             return;
          }
          
          const entryPrice = curr.close;
          
          const sweepRes = this.lastRuleResults['rule_sweep'];
          const recentSweep = sweepRes?.evidence?.sweep || sweepRes?.evidence?.sweeps?.[sweepRes?.evidence?.sweeps?.length - 1];
          
          if (!recentSweep) {
             this.stateMachine.transition('REJECTED', 'Sweep data missing for SL placement');
             return;
          }
          
          const pipBuffer = 0.50; // 5 pips
          const slPrice = direction === 'buy' ? recentSweep.price - pipBuffer : recentSweep.price + pipBuffer;
          
          const risk = Math.abs(entryPrice - slPrice);
          const tp1Price = direction === 'buy' ? entryPrice + (risk * 3) : entryPrice - (risk * 3); // High RR for news
          
          this.stateMachine.transition('WAIT_AI', 'Structure shift confirmed, awaiting AI', undefined, {
             direction, entryPrice, slPrice, tp1Price
          });
        } else if (res.status === 'invalid') {
          this.stateMachine.transition('REJECTED', 'No reversal structure M1 formed');
        }
        break;
      }
    }
  }
}
