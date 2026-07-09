export * from './core';

export type IntegrationStatus = 'active' | 'not configured' | 'placeholder' | 'disabled' | 'unavailable' | 'needs verification';

export type StepStatus = 'awaiting' | 'active' | 'validated' | 'approved' | 'rejected' | 'expired';

export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'error' | 'unavailable';

export type AIDecision = 'APPROVED' | 'REJECTED' | 'WAIT' | 'INVALIDATED' | 'FAILED';

export interface ProviderStatus {
  status?: string;
  available?: boolean;
  reason?: string;
}

export interface AIChecklistItem {
  rule: string;
  status: 'PASS' | 'FAIL' | 'WAIT' | 'INVALIDATED';
  evidence: string;
  reason: string;
}

export interface AIValidation {
  strategyName: string;
  decision: AIDecision;
  checklist: AIChecklistItem[];
  reasoning: string;
  missingFactors?: string[];
  riskNotes?: string;
  recommendedAction?: string;
}

export interface Signal {
  correlationId?: string;
  signalKey: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  session: string;
  direction: 'buy' | 'sell';
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  aiDecision: AIDecision;
  aiReasoning?: string;
  aiEvidence?: string;
  aiRulesChecked?: string[];
  aiRulesPassed?: string[];
  aiRulesFailed?: string[];
  aiConflicts?: string;
  aiChecklist?: AIChecklistItem[];
  status: 'SIGNAL_ACTIVE' | 'TAKE_PARTIAL' | 'FINISHED' | 'REJECTED' | 'EXPIRED' | 'SUPPRESSED';
  createdAt: string;
}

export type StateName = 
  | 'IDLE'
  | 'WAIT_SESSION'
  | 'WAIT_TREND'
  | 'WAIT_LEVEL'
  | 'WAIT_SWEEP'
  | 'WAIT_RETRACEMENT'
  | 'WAIT_CONFIRMATION'
  | 'WAIT_PATTERN'
  | 'WAIT_NECKLINE_BREAK'
  | 'WAIT_RETEST'
  | 'WAIT_NEWS'
  | 'WAIT_REJECTION'
  | 'WAIT_STRUCTURE'
  | 'WAIT_AI'
  | 'SIGNAL_ACTIVE'
  | 'TAKE_PARTIAL'
  | 'FINISHED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPPRESSED';

export type RuleStatus = 'valid' | 'invalid' | 'suppressed' | 'unknown';

export interface RuleResult {
  ruleId: string;
  status: RuleStatus;
  evidence: Record<string, any>;
  invalidations: string[];
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export interface ProviderHealth {
  providerName: string;
  category: 'price' | 'news' | 'calendar' | 'sentiment' | 'ai';
  healthStatus: HealthStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  circuitBreakerStatus: 'closed' | 'open' | 'half_open';
}

export interface MarketSnapshot extends ProviderStatus {
  symbol: string;
  price: number | null;
  timestamp: string;
  provider: string;
  freshness: 'live' | 'cached' | 'stale';
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsEvent {
  id: string;
  title: string;
  source: string;
  impact: 'low' | 'medium' | 'high';
  publishedAt: string;
  url?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  country: string;
  impact: 'low' | 'medium' | 'high';
  time: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}
