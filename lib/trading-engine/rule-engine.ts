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
import { findSweeps, detectEngulfing, detectDoubleTopBottom, analyzeStructure, findBOS } from './indicators';

export interface RuleEvaluationContext {
  symbol: string;
  timeframe: string;
  timestamp: string;
  marketData: Record<string, any>;
  indicators: Record<string, any>;
  candles?: Candle[];
  correlationId?: string;
}

export class RuleEngine {
  // --- KILLZONE / SESSION RULE ---
  evaluateSession(context: RuleEvaluationContext, targetSession: 'london' | 'newyork' | 'all'): RuleResult {
    try {
      const timestamp = context.timestamp || new Date().toISOString();
      const currentZone = KillzoneEngine.evaluate(timestamp);
      
      let inSession = false;
      if (targetSession === 'all') {
         inSession = true;
      } else {
         inSession = currentZone === targetSession;
      }

      if (inSession) {
        return this.createResult('rule_session', 'valid', { session: currentZone, target: targetSession }, []);
      } else {
        return this.createResult('rule_session', 'invalid', { session: currentZone, target: targetSession }, [`Time window outside of target session ${targetSession}`]);
      }
    } catch (e: any) {
      return this.createResult('rule_session', 'unknown', {}, [`Session parsing error: ${e.message}`]);
    }
  }

  // --- TREND RULE ---
  evaluateTrend(context: RuleEvaluationContext, _timeframe?: string): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 200) {
      return this.createResult('rule_trend', 'unknown', {}, ['Insufficient candles for MA200 evaluation']);
    }

    const ma50 = MAEngine.evaluate(candles, 50);
    const ma200 = MAEngine.evaluate(candles, 200);
    const structure = analyzeStructure(candles, 15, 15);

    if (!ma50 || !ma200) return this.createResult('rule_trend', 'unknown', {}, ['MA calculation failed']);

    let trend = 'sideways';
    let invalidations = [];

    if (ma50 > ma200 && structure.trend !== 'bearish') {
      trend = 'bullish';
    } else if (ma50 < ma200 && structure.trend !== 'bullish') {
      trend = 'bearish';
    } else {
      invalidations.push('Struktur HTF berlawanan atau MA flat (sideways)');
      return this.createResult('rule_trend', 'invalid', { trend, ma50, ma200, structure: structure.trend }, invalidations);
    }
    
    return this.createResult('rule_trend', 'valid', { trend, ma50, ma200, structure: structure.trend }, []);
  }

  // --- LIQUIDITY SWEEP RULE ---
  evaluateLiquiditySweep(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('rule_sweep', 'unknown', {}, ['Insufficient candles for sweep detection']);
    
    if (!context.indicators.sweeps) context.indicators.sweeps = findSweeps(candles);
    const sweeps = context.indicators.sweeps;
    if (sweeps.length > 0) {
        const lastSweep = sweeps[sweeps.length - 1];
        const sweepIndex = candles.findIndex((c: Candle) => c.timestamp === lastSweep.time);
        if (sweepIndex > -1 && candles.length - sweepIndex <= 5) {
            return this.createResult('rule_sweep', 'valid', { sweep: lastSweep }, []);
        } else {
            return this.createResult('rule_sweep', 'invalid', {}, ['Sweep is too old or stale']);
        }
    }
    return this.createResult('rule_sweep', 'invalid', {}, ['Hanya retracement biasa tanpa sweep']);
  }

  // --- CHoCH RULE ---
  evaluateStructureBreak(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('rule_choch', 'unknown', {}, ['Insufficient candles for structure']);
    
    if (!context.indicators.mss) context.indicators.mss = MSSEngine.evaluate(candles);
    const mss = context.indicators.mss;
    if (mss) {
        const mssIndex = candles.findIndex((c: Candle) => c.timestamp === mss.time);
        if (mssIndex > -1 && candles.length - mssIndex <= 5) {
            return this.createResult('rule_choch', 'valid', { mss }, []);
        } else {
            return this.createResult('rule_choch', 'invalid', {}, ['CHoCH is too old or stale']);
        }
    }
    return this.createResult('rule_choch', 'invalid', {}, ['Breakout tipis yang langsung gagal atau tidak ada close konfirmasi']);
  }

  // --- MSS RULE ---
  evaluateMSS(context: RuleEvaluationContext): RuleResult {
      return this.evaluateStructureBreak(context);
  }

  // --- BOS RULE ---
  evaluateBOS(context: RuleEvaluationContext): RuleResult {
      const candles = context.candles || context.marketData?.candles || [];
      if (!context.indicators.bos) context.indicators.bos = findBOS(candles);
      const bos = context.indicators.bos;
      if (bos.length > 0) {
          const lastBos = bos[bos.length - 1];
          const bosIndex = candles.findIndex((c: Candle) => c.timestamp === lastBos.time);
          if (bosIndex > -1 && candles.length - bosIndex <= 5) {
              return this.createResult('rule_bos', 'valid', { bos: lastBos }, []);
          } else {
              return this.createResult('rule_bos', 'invalid', {}, ['BOS is too old or stale']);
          }
      }
      return this.createResult('rule_bos', 'invalid', {}, ['Wick semu tanpa continuation']);
  }

  // --- ORDER BLOCK RULE ---
  evaluateSupplyDemandZone(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 20) return this.createResult('rule_ob', 'unknown', {}, ['Insufficient candles']);
    
    if (!context.indicators.obs) context.indicators.obs = SupplyDemandEngine.evaluate(candles);
    const obs = context.indicators.obs;
    if (obs.length > 0) {
       // Allow OB to be slightly older but price must be near it.
       const lastOb = obs[obs.length - 1];
       const currentPrice = candles[candles.length - 1].close;
       // Check if price is within the OB zone
       if (currentPrice >= lastOb.bottom && currentPrice <= lastOb.top) {
           return this.createResult('rule_ob', 'valid', { ob: lastOb }, []);
       } else {
           return this.createResult('rule_ob', 'invalid', {}, ['Price is not mitigating the OB currently']);
       }
    }
    return this.createResult('rule_ob', 'invalid', {}, ['Candle acak tanpa displacement (bukan OB valid)']);
  }

  // --- FAIR VALUE GAP RULE ---
  evaluateRetest(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (!context.indicators.fvgs) context.indicators.fvgs = ImbalanceEngine.evaluate(candles);
    const fvgs = context.indicators.fvgs;
    if (fvgs.length > 0) {
        const lastFvg = fvgs[fvgs.length - 1];
        const currentPrice = candles[candles.length - 1].close;
        // Check if price is within the FVG (mitigating it)
        if (currentPrice >= lastFvg.bottom && currentPrice <= lastFvg.top) {
            return this.createResult('rule_fvg', 'valid', { fvg: lastFvg }, []);
        } else {
            return this.createResult('rule_fvg', 'invalid', {}, ['Price is not mitigating the FVG currently']);
        }
    }
    return this.createResult('rule_fvg', 'invalid', {}, ['Area sudah terisi penuh atau tidak ada displacement']);
  }

  // --- EQUAL HIGH / EQUAL LOW RULE ---
  evaluateEqualHighLow(context: RuleEvaluationContext): RuleResult {
      const candles = context.candles || context.marketData?.candles || [];
      if (!context.indicators.eqhl) context.indicators.eqhl = EqualHighLowEngine.evaluate(candles);
      const { eqh, eql } = context.indicators.eqhl;
      if (eqh.length > 0 || eql.length > 0) {
          return this.createResult('rule_eqhl', 'valid', { eqh, eql }, []);
      }
      return this.createResult('rule_eqhl', 'invalid', {}, ['Level terlalu jauh atau tidak presisi']);
  }

  // --- LEVEL LIQUIDITY RULE (for strategy compat) ---
  evaluateLiquidityLevel(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 50) return this.createResult('rule_level_liquidity', 'unknown', {}, ['Insufficient candles for pivots']);
    
    if (!context.indicators.pivots) context.indicators.pivots = LiquidityMapEngine.evaluate(candles);
    const pivots = context.indicators.pivots;
    return this.createResult('rule_level_liquidity', 'valid', { levels: pivots }, []);
  }

  // --- OTHER PATTERNS (for compat) ---
  evaluateEngulfing(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    const engulfing = detectEngulfing(candles);
    if (engulfing) {
        return this.createResult('rule_engulfing', 'valid', { engulfing }, []);
    }
    return this.createResult('rule_engulfing', 'invalid', {}, ['No engulfing pattern detected']);
  }

  evaluateChartPattern(context: RuleEvaluationContext, pattern: 'double_top' | 'double_bottom'): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    const detected = detectDoubleTopBottom(candles);
    if (detected === pattern) {
        return this.createResult('rule_pattern', 'valid', { pattern: detected }, []);
    }
    return this.createResult('rule_pattern', 'invalid', {}, ['Pattern not detected']);
  }

  evaluateNecklineBreak(context: RuleEvaluationContext): RuleResult {
    return this.evaluateStructureBreak(context);
  }

  evaluateNewsImpact(context: RuleEvaluationContext): RuleResult {
    const news = context.marketData?.news || [];
    const highImpact = news.filter((n: any) => n.impact === 'high');
    if (highImpact.length > 0) {
        return this.createResult('rule_news', 'valid', { news: highImpact }, []);
    }
    return this.createResult('rule_news', 'invalid', {}, ['No high impact news']);
  }

  evaluateAggressiveRejection(context: RuleEvaluationContext): RuleResult {
    const candles = context.candles || context.marketData?.candles || [];
    if (candles.length < 20) return this.createResult('rule_rejection', 'unknown', {}, ['No candles']);
    
    const curr = candles[candles.length - 1];
    const bodySize = Math.abs(curr.close - curr.open);
    const upperWick = curr.high - Math.max(curr.close, curr.open);
    const lowerWick = Math.min(curr.close, curr.open) - curr.low;
    
    const { calculateATR } = require('./indicators');
    const atr = calculateATR(candles, 20) || 0.0001;

    if ((upperWick > bodySize * 2 && upperWick > atr * 0.3) || (lowerWick > bodySize * 2 && lowerWick > atr * 0.3)) {
        return this.createResult('rule_rejection', 'valid', { rejection: true }, []);
    }
    return this.createResult('rule_rejection', 'invalid', {}, ['No strong rejection wick relative to ATR']);
  }

  private createResult(ruleId: string, status: RuleStatus, evidence: Record<string, any> = {}, invalidations: string[] = []): RuleResult {
    return {
      ruleId,
      status,
      evidence,
      invalidations,
      timestamp: new Date().toISOString()
    };
  }
}
