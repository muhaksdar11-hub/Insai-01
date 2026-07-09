export type TradeStatus = 'OPEN' | 'CLOSED' | 'PENDING' | 'CANCELLED';
export type TradeDirection = 'BUY' | 'SELL' | 'LONG' | 'SHORT';

export interface MarketData {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe?: string;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice?: number;
  volume: number;
  timestamp: string;
  exitTimestamp?: string;
  status: TradeStatus;
  pnl?: number;
  strategyId?: string;
}

export interface TradingRule {
  id: string;
  name: string;
  description: string;
  category: 'ENTRY' | 'EXIT' | 'RISK' | 'FILTER';
  isActive: boolean;
  // Parameters specific to the rule, e.g., { period: 14, threshold: 70 }
  parameters?: Record<string, any>;
}

export interface AIAnalysis {
  checklist: any[];
  patternExplanation: string;
  riskExplanation: string;
  decision: 'APPROVE' | 'REJECT' | 'PENDING' | 'HOLD';
  missingFactors?: string[];
  recommendedAction?: string;
}
