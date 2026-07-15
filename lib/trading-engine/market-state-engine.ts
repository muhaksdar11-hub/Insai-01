import { RuleEvaluationContext, RuleEngine } from './rule-engine';
import { getAllStrategies } from './strategy-registry';

export enum MarketState {
  TRENDING = 'TRENDING',
  RANGING = 'RANGING',
  EXPANSION = 'EXPANSION',
  COMPRESSION = 'COMPRESSION',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_VOLATILITY = 'LOW_VOLATILITY',
  NEWS_MODE = 'NEWS_MODE',
  SESSION_TRANSITION = 'SESSION_TRANSITION',
  LIQUIDITY_HUNT = 'LIQUIDITY_HUNT'
}

export class MarketStateEngine {
  private ruleEngine: RuleEngine;

  constructor(ruleEngine: RuleEngine) {
    this.ruleEngine = ruleEngine;
  }

  public classifyState(context: RuleEvaluationContext): MarketState[] {
    const states: MarketState[] = [];

    // Evaluate base rules
    const trendResult = this.ruleEngine.executeRule('rule_trend', context);
    const volResult = this.ruleEngine.executeRule('rule_volatility', context);
    const newsResult = this.ruleEngine.executeRule('rule_news', context);
    const sessionResult = this.ruleEngine.executeRule('rule_session', context, 'all');
    const sweepResult = this.ruleEngine.executeRule('rule_sweep', context);

    // 1. News Mode (Highest priority)
    if (newsResult.status === 'valid') {
      states.push(MarketState.NEWS_MODE);
    }

    // 2. Volatility and Volatility Regimes
    const isHighVol = volResult.status === 'valid';
    
    if (isHighVol) {
      states.push(MarketState.HIGH_VOLATILITY);
    } else {
      states.push(MarketState.LOW_VOLATILITY);
    }

    // 3. Trend vs Ranging
    const isTrending = trendResult.status === 'valid';
    if (isTrending) {
      states.push(MarketState.TRENDING);
      
      // Expansion: High Volatility + Trending
      if (isHighVol) {
        states.push(MarketState.EXPANSION);
      }
    } else {
      states.push(MarketState.RANGING);
      
      // Compression: Low Volatility + Ranging
      if (!isHighVol) {
        states.push(MarketState.COMPRESSION);
      }
    }

    // 4. Session Transition
    // Rule Session valid means we are in an active window, but let's see if we are in transition (e.g. first hour of London or NY)
    // We can infer session transition if we are in London or NewYork specifically early on, or just rely on session being active but recent.
    // For now, if session is 'valid', we could check specific conditions, or just use it.
    if (sessionResult.status === 'valid') {
       // Consider valid session as a transition if it's high impact
       // Or we can add custom logic for first 1 hour
       states.push(MarketState.SESSION_TRANSITION);
    }

    // 5. Liquidity Hunt
    // If there is a sweep but trend might be shifting or just high volatility ranging
    if (sweepResult.status === 'valid' && isHighVol) {
       states.push(MarketState.LIQUIDITY_HUNT);
    }

    // Ensure deterministic ordering (by Enum value or priority)
    return Array.from(new Set(states));
  }

  public getRelevantStrategies(states: MarketState[]): string[] {
    const allStrategies = getAllStrategies().sort((a, b) => b.priority - a.priority);
    const relevantStrategies: string[] = [];

    for (const strat of allStrategies) {
        if (strat.isRelevantForStates(states)) {
            relevantStrategies.push(strat.id);
        }
    }

    // Fallback: if no specific state maps well (very rare), run the highest priority one that might fit loosely
    if (relevantStrategies.length === 0) {
        if (states.includes(MarketState.TRENDING)) {
            relevantStrategies.push('strategy-1-smc');
            relevantStrategies.push('strategy-2-snd');
        } else {
            relevantStrategies.push('strategy-3-scalping');
        }
    }

    // Return in deterministic priority order (since they were sorted initially)
    return relevantStrategies;
  }
}
