import { RuleResult, RuleStatus, Candle } from '@/types';
import { 
    LiquidityMapEngine, 
    ImbalanceEngine, 
    SupplyDemandEngine, 
    MSSEngine, 
    MAEngine,
    EqualHighLowEngine,
    KillzoneEngine
} from '../mcp/engines/smc-engines';
import { findSweeps, detectEngulfing, detectDoubleTopBottom, analyzeStructure, findBOS, calculateATR } from './indicators';

export interface RuleEvaluationContext {
  symbol: string;
  timeframe: string;
  timestamp: string;
  marketData: Record<string, any>;
  indicators: Record<string, any>;
  candles?: Candle[];
  correlationId?: string;
}

// ==========================================
// MODULAR RULES (SOLID Principles)
// ==========================================

export interface IRule {
  id: string;
  evaluate(context: RuleEvaluationContext, ...args: any[]): RuleResult;
}

export abstract class BaseRule implements IRule {
  abstract id: string;
  abstract evaluate(context: RuleEvaluationContext, ...args: any[]): RuleResult;

  protected createResult(status: RuleStatus, evidence: Record<string, any> = {}, invalidations: string[] = []): RuleResult {
    return {
      ruleId: this.id,
      status,
      evidence,
      invalidations,
      timestamp: new Date().toISOString()
    };
  }
}

export class SessionRule extends BaseRule {
  id = 'rule_session';
  evaluate(context: RuleEvaluationContext, targetSession: 'london' | 'newyork' | 'all'): RuleResult {
    try {
      const timestamp = context.timestamp || new Date().toISOString();
      const currentZone = KillzoneEngine.evaluate(timestamp);
      
      const inSession = targetSession === 'all' || currentZone === targetSession;

      if (inSession) {
        return this.createResult('valid', { session: currentZone, target: targetSession });
      }
      return this.createResult('invalid', { session: currentZone, target: targetSession }, [`Time window outside of target session ${targetSession}`]);
    } catch (e: any) {
      return this.createResult('unknown', {}, [`Session parsing error: ${e.message}`]);
    }
  }
}

export class TrendRule extends BaseRule {
  id = 'rule_trend';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 200) return this.createResult('unknown', {}, ['Insufficient candles for MA200 evaluation']);

    const ma50 = MAEngine.evaluate(candles, 50);
    const ma200 = MAEngine.evaluate(candles, 200);
    const structure = analyzeStructure(candles, 15, 15);

    if (!ma50 || !ma200) return this.createResult('unknown', {}, ['MA calculation failed']);

    let trend = 'sideways';
    let invalidations = [];

    if (ma50 > ma200 && structure.trend !== 'bearish') {
      trend = 'bullish';
    } else if (ma50 < ma200 && structure.trend !== 'bullish') {
      trend = 'bearish';
    } else {
      invalidations.push('Struktur HTF berlawanan atau MA flat (sideways)');
      return this.createResult('invalid', { trend, ma50, ma200, structure: structure.trend }, invalidations);
    }
    
    return this.createResult('valid', { trend, ma50, ma200, structure: structure.trend });
  }
}

export class LiquiditySweepRule extends BaseRule {
  id = 'rule_sweep';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('unknown', {}, ['Insufficient candles for sweep detection']);
    
    if (!context.indicators.sweeps) context.indicators.sweeps = findSweeps(candles);
    const sweeps = context.indicators.sweeps;
    if (sweeps.length > 0) {
        const lastSweep = sweeps[sweeps.length - 1];
        const sweepIndex = candles.findIndex((c: Candle) => c.timestamp === lastSweep.time);
        if (sweepIndex > -1 && candles.length - sweepIndex <= 5) {
            return this.createResult('valid', { sweep: lastSweep });
        }
        return this.createResult('invalid', {}, ['Sweep is too old or stale']);
    }
    return this.createResult('invalid', {}, ['Hanya retracement biasa tanpa sweep']);
  }
}

export class StructureBreakRule extends BaseRule {
  id = 'rule_choch';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('unknown', {}, ['Insufficient candles for structure']);
    
    if (!context.indicators.mss) context.indicators.mss = MSSEngine.evaluate(candles);
    const mss = context.indicators.mss;
    if (mss) {
        const mssIndex = candles.findIndex((c: Candle) => c.timestamp === mss.time);
        if (mssIndex > -1 && candles.length - mssIndex <= 5) {
            return this.createResult('valid', { mss });
        }
        return this.createResult('invalid', {}, ['CHoCH is too old or stale']);
    }
    return this.createResult('invalid', {}, ['Breakout tipis yang langsung gagal atau tidak ada close konfirmasi']);
  }
}

export class BOSRule extends BaseRule {
  id = 'rule_bos';
  evaluate(context: RuleEvaluationContext): RuleResult {
      const candles = context.candles || context.marketData?.candles || [];
      if (!context.indicators.bos) context.indicators.bos = findBOS(candles);
      const bos = context.indicators.bos;
      if (bos.length > 0) {
          const lastBos = bos[bos.length - 1];
          const bosIndex = candles.findIndex((c: Candle) => c.timestamp === lastBos.time);
          if (bosIndex > -1 && candles.length - bosIndex <= 5) {
              return this.createResult('valid', { bos: lastBos });
          }
          return this.createResult('invalid', {}, ['BOS is too old or stale']);
      }
      return this.createResult('invalid', {}, ['Wick semu tanpa continuation']);
  }
}

export class SupplyDemandZoneRule extends BaseRule {
  id = 'rule_ob';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 20) return this.createResult('unknown', {}, ['Insufficient candles']);
    
    if (!context.indicators.obs) context.indicators.obs = SupplyDemandEngine.evaluate(candles);
    const obs = context.indicators.obs;
    if (obs.length > 0) {
       const lastOb = obs[obs.length - 1];
       const currentPrice = candles[candles.length - 1].close;
       if (currentPrice >= lastOb.bottom && currentPrice <= lastOb.top) {
           return this.createResult('valid', { ob: lastOb });
       }
       return this.createResult('invalid', {}, ['Price is not mitigating the OB currently']);
    }
    return this.createResult('invalid', {}, ['Candle acak tanpa displacement (bukan OB valid)']);
  }
}

export class RetestRule extends BaseRule {
  id = 'rule_fvg';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (!context.indicators.fvgs) context.indicators.fvgs = ImbalanceEngine.evaluate(candles);
    const fvgs = context.indicators.fvgs;
    if (fvgs.length > 0) {
        const lastFvg = fvgs[fvgs.length - 1];
        const currentPrice = candles[candles.length - 1].close;
        if (currentPrice >= lastFvg.bottom && currentPrice <= lastFvg.top) {
            return this.createResult('valid', { fvg: lastFvg });
        }
        return this.createResult('invalid', {}, ['Price is not mitigating the FVG currently']);
    }
    return this.createResult('invalid', {}, ['Area sudah terisi penuh atau tidak ada displacement']);
  }
}

export class EqualHighLowRule extends BaseRule {
  id = 'rule_eqhl';
  evaluate(context: RuleEvaluationContext): RuleResult {
      const candles = context.candles || context.marketData?.candles || [];
      if (!context.indicators.eqhl) context.indicators.eqhl = EqualHighLowEngine.evaluate(candles);
      const { eqh, eql } = context.indicators.eqhl;
      if (eqh.length > 0 || eql.length > 0) {
          return this.createResult('valid', { eqh, eql });
      }
      return this.createResult('invalid', {}, ['Level terlalu jauh atau tidak presisi']);
  }
}

export class LiquidityLevelRule extends BaseRule {
  id = 'rule_level_liquidity';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('unknown', {}, ['Insufficient candles for pivots']);
    
    if (!context.indicators.pivots) context.indicators.pivots = LiquidityMapEngine.evaluate(candles);
    const pivots = context.indicators.pivots;
    return this.createResult('valid', { levels: pivots });
  }
}

export class EngulfingRule extends BaseRule {
  id = 'rule_engulfing';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    const engulfing = detectEngulfing(candles);
    if (engulfing) {
        return this.createResult('valid', { engulfing });
    }
    return this.createResult('invalid', {}, ['No engulfing pattern detected']);
  }
}

export class ChartPatternRule extends BaseRule {
  id = 'rule_pattern';
  evaluate(context: RuleEvaluationContext, pattern: 'double_top' | 'double_bottom'): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    const detected = detectDoubleTopBottom(candles);
    if (detected === pattern) {
        return this.createResult('valid', { pattern: detected });
    }
    return this.createResult('invalid', {}, ['Pattern not detected']);
  }
}

export class AggressiveRejectionRule extends BaseRule {
  id = 'rule_rejection';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 20) return this.createResult('unknown', {}, ['No candles']);
    
    const curr = candles[candles.length - 1];
    const bodySize = Math.abs(curr.close - curr.open);
    const upperWick = curr.high - Math.max(curr.close, curr.open);
    const lowerWick = Math.min(curr.close, curr.open) - curr.low;
    
    const atr = calculateATR(candles, 20) || 0.0001;

    if ((upperWick > bodySize * 2 && upperWick > atr * 0.3) || (lowerWick > bodySize * 2 && lowerWick > atr * 0.3)) {
        return this.createResult('valid', { rejection: true });
    }
    return this.createResult('invalid', {}, ['No strong rejection wick relative to ATR']);
  }
}

export class VolumeRule extends BaseRule {
  id = 'rule_volume';
  evaluate(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || [];
    if (candles.length < 20) return this.createResult('unknown', {}, ['No candles for volume analysis']);
    
    let volSum = 0;
    for (let i = candles.length - 20; i < candles.length - 1; i++) {
        volSum += candles[i].volume || 0;
    }
    const avgVol = volSum / 19;
    const currentVol = candles[candles.length - 1].volume || 0;

    if (currentVol > avgVol * 1.5) {
        return this.createResult('valid', { volume: currentVol, avgVolume: avgVol, status: 'high' });
    }
    return this.createResult('invalid', { volume: currentVol, avgVolume: avgVol, status: 'low' }, ['Volume is not significantly above average']);
  }
}

export class VolatilityRule extends BaseRule {
  id = 'rule_volatility';
  evaluate(context: RuleEvaluationContext): RuleResult {
      const candles = context.candles || [];
      if (candles.length < 20) return this.createResult('unknown', {}, ['No candles for volatility analysis']);
      
      const atr = calculateATR(candles, 14);
      if (atr && atr > 1.5) { 
          return this.createResult('valid', { atr });
      }
      return this.createResult('invalid', { atr }, ['Volatility is too low']);
  }
}

export class CorrelationRule extends BaseRule {
  id = 'rule_correlation';
  evaluate(context: RuleEvaluationContext): RuleResult {
      const { correlations } = context.marketData || {};
      if (correlations) {
          return this.createResult('valid', { dxy: correlations.dxy, us10y: correlations.us10y, cotData: correlations.cotData });
      }
      return this.createResult('unknown', {}, ['No correlation data available']);
  }
}

export class NewsRule extends BaseRule {
  id = 'rule_news';
  evaluate(context: RuleEvaluationContext): RuleResult {
      const { calendar } = context.marketData || {};
      const highImpact = calendar?.filter((e: any) => e.impact === 'high' || e.impact === 'High') || [];
      
      if (highImpact.length > 0) {
          return this.createResult('valid', { news: highImpact });
      }
      return this.createResult('invalid', {}, ['No high impact news']);
  }
}

// ==========================================
// CORE RULE ENGINE (Facade/Registry)
// ==========================================

export class RuleEngine {
  private rules: Map<string, IRule> = new Map();

  constructor() {
    this.registerRule(new SessionRule());
    this.registerRule(new TrendRule());
    this.registerRule(new LiquiditySweepRule());
    this.registerRule(new StructureBreakRule());
    this.registerRule(new BOSRule());
    this.registerRule(new SupplyDemandZoneRule());
    this.registerRule(new RetestRule());
    this.registerRule(new EqualHighLowRule());
    this.registerRule(new LiquidityLevelRule());
    this.registerRule(new EngulfingRule());
    this.registerRule(new ChartPatternRule());
    this.registerRule(new AggressiveRejectionRule());
    this.registerRule(new VolumeRule());
    this.registerRule(new VolatilityRule());
    this.registerRule(new CorrelationRule());
    this.registerRule(new NewsRule());
  }

  public registerRule(rule: IRule) {
    this.rules.set(rule.id, rule);
  }

  public executeRule(ruleId: string, context: RuleEvaluationContext, ...args: any[]): RuleResult {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    return rule.evaluate(context, ...args);
  }

  // Legacy facade methods for backwards compatibility with existing strategies
  evaluateSession(context: RuleEvaluationContext, targetSession: 'london' | 'newyork' | 'all'): RuleResult { return this.executeRule('rule_session', context, targetSession); }
  evaluateTrend(context: RuleEvaluationContext, _timeframe?: string): RuleResult { return this.executeRule('rule_trend', context, _timeframe); }
  evaluateLiquiditySweep(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_sweep', context); }
  evaluateStructureBreak(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_choch', context); }
  evaluateMSS(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_choch', context); }
  evaluateBOS(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_bos', context); }
  evaluateSupplyDemandZone(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_ob', context); }
  evaluateRetest(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_fvg', context); }
  evaluateEqualHighLow(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_eqhl', context); }
  evaluateLiquidityLevel(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_level_liquidity', context); }
  evaluateEngulfing(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_engulfing', context); }
  evaluateChartPattern(context: RuleEvaluationContext, pattern: 'double_top' | 'double_bottom'): RuleResult { return this.executeRule('rule_pattern', context, pattern); }
  evaluateNecklineBreak(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_choch', context); }
  evaluateAggressiveRejection(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_rejection', context); }
  evaluateVolume(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_volume', context); }
  evaluateVolatility(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_volatility', context); }
  evaluateCorrelation(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_correlation', context); }
  evaluateNews(context: RuleEvaluationContext): RuleResult { return this.executeRule('rule_news', context); }
}
