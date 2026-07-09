export type RiskDecisionStatus = 'allow' | 'warning' | 'suppress' | 'block' | 'kill_switch';

export interface RiskContext {
  strategyId: string;
  symbol: string;
  timeframe: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  newsWindow?: boolean;
  spread?: number;
  slippage?: number;
  accountBalance: number;
}

export interface RiskDecision {
  status: RiskDecisionStatus;
  reason: string;
  parameters: Record<string, any>;
  thresholds: Record<string, any>;
  timestamp: string;
  strategyReference: string;
  suggestedPositionSize?: number;
}

export interface PositionSizingResult {
  allowed: boolean;
  size: number;
  reason: string;
}

export interface RiskLimits {
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  maxMonthlyLoss: number;
  maxConsecutiveLosses: number;
  maxDrawdown: number;
  maxSignalsPerDay: number;
  maxSignalsPerSession: number;
  riskPerSignalPercent: number;
}
