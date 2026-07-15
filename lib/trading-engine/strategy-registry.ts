import { RuleEvaluationContext } from './rule-engine';
import { MarketState } from './market-state-engine';

export interface StrategyDefinition {
    id: string;
    name: string;
    priority: number;
    isRelevantForStates: (states: MarketState[]) => boolean;
    extractCandidateRules: (context: RuleEvaluationContext, rules: any, ruleEngine: any) => {
        isCandidateValid: boolean;
        direction?: 'buy' | 'sell';
        candidateRules: any;
    };
}

export const StrategyRegistry: Record<string, StrategyDefinition> = {
    'strategy-4-news': {
        id: 'strategy-4-news',
        name: 'High Impact News Reversal',
        priority: 10,
        isRelevantForStates: (states) => states.includes(MarketState.NEWS_MODE),
        extractCandidateRules: (context, rules, ruleEngine) => {
            const { sweep } = rules;
            const rejection = ruleEngine.executeRule('rule_rejection', context);
            const isCandidateValid = sweep?.status === 'valid' || rejection?.status === 'valid';
            let direction: 'buy' | 'sell' | undefined;
            if (isCandidateValid) {
                if (sweep?.status === 'valid' && sweep.evidence?.sweep) {
                    direction = sweep.evidence.sweep.type === 'high_sweep' ? 'sell' : 'buy';
                } else if (rejection?.status === 'valid') {
                    const c = context.candles![context.candles!.length - 1];
                    direction = c.close > c.open ? 'buy' : 'sell';
                }
            }
            return { isCandidateValid, direction, candidateRules: { sweep, rejection } };
        }
    },
    'strategy-5-smc-sd-confluence': {
        id: 'strategy-5-smc-sd-confluence',
        name: 'SMC-SD Pattern Confluence',
        priority: 15,
        isRelevantForStates: () => true, // We delegate entirely to the Python Engine
        extractCandidateRules: (_context, _rules, _ruleEngine) => {
            // Because the Python Engine handles the full 4-layer check for this strategy,
            // we always pass the initial TS gates and let Python do the work.
            return { isCandidateValid: true, direction: 'buy', candidateRules: {} };
        }
    },
    'strategy-1-smc': {
        id: 'strategy-1-smc',
        name: 'SMC London Killzone',
        priority: 5,
        isRelevantForStates: (states) => 
            states.includes(MarketState.SESSION_TRANSITION) || 
            states.includes(MarketState.LIQUIDITY_HUNT) || 
            states.includes(MarketState.EXPANSION) ||
            states.includes(MarketState.TRENDING),
        extractCandidateRules: (_context, rules, _ruleEngine) => {
            const { sweep } = rules;
            const isCandidateValid = sweep?.status === 'valid';
            let direction: 'buy' | 'sell' | undefined;
            if (isCandidateValid && sweep.evidence?.sweep) {
                direction = sweep.evidence.sweep.type === 'high_sweep' ? 'sell' : 'buy';
            }
            return { isCandidateValid, direction, candidateRules: { sweep } };
        }
    },
    'strategy-2-snd': {
        id: 'strategy-2-snd',
        name: 'SnD Engulfing Confirmation',
        priority: 4,
        isRelevantForStates: (states) => 
            states.includes(MarketState.TRENDING) && 
            states.includes(MarketState.HIGH_VOLATILITY),
        extractCandidateRules: (_context, rules, _ruleEngine) => {
            const { engulfing } = rules;
            const isCandidateValid = engulfing?.status === 'valid';
            let direction: 'buy' | 'sell' | undefined;
            if (isCandidateValid && engulfing.evidence?.engulfing) {
                direction = engulfing.evidence.engulfing === 'bearish_engulfing' ? 'sell' : 'buy';
            }
            return { isCandidateValid, direction, candidateRules: { engulfing } };
        }
    },
    'strategy-3-scalping': {
        id: 'strategy-3-scalping',
        name: 'M1/M5 SMC Scalping',
        priority: 1,
        isRelevantForStates: (states) => 
            states.includes(MarketState.RANGING) || 
            states.includes(MarketState.COMPRESSION) || 
            states.includes(MarketState.LOW_VOLATILITY),
        extractCandidateRules: (_context, rules, _ruleEngine) => {
            const { trend, vol } = rules;
            const isCandidateValid = trend?.status === 'valid' && vol?.status === 'valid';
            let direction: 'buy' | 'sell' | undefined;
            if (isCandidateValid && trend.evidence?.trend) {
                direction = trend.evidence.trend === 'bullish' ? 'buy' : 'sell';
            }
            return { isCandidateValid, direction, candidateRules: { trend, vol } };
        }
    }
};

export function getStrategyDefinition(id: string): StrategyDefinition | undefined {
    return StrategyRegistry[id];
}

export function getAllStrategies(): StrategyDefinition[] {
    return Object.values(StrategyRegistry);
}
