import { BaseValidator } from './base-validator';

import { TrendValidator } from './modules/trend-validator';
import { MarketStructureValidator } from './modules/market-structure-validator';
import { BOSValidator } from './modules/bos-validator';
import { CHOCHValidator } from './modules/choch-validator';
import { LiquidityValidator } from './modules/liquidity-validator';
import { LiquiditySweepValidator } from './modules/liquidity-sweep-validator';
import { OrderBlockValidator } from './modules/order-block-validator';
import { BreakerBlockValidator } from './modules/breaker-block-validator';
import { MitigationBlockValidator } from './modules/mitigation-block-validator';
import { FairValueGapValidator } from './modules/fair-value-gap-validator';
import { PremiumDiscountValidator } from './modules/premium-discount-validator';
import { FibonacciValidator } from './modules/fibonacci-validator';
import { VolumeValidator } from './modules/volume-validator';
import { VolatilityValidator } from './modules/volatility-validator';
import { SessionValidator } from './modules/session-validator';
import { NewsValidator } from './modules/news-validator';
import { CorrelationValidator } from './modules/correlation-validator';
import { RiskValidator } from './modules/risk-validator';
import { EntryValidator } from './modules/entry-validator';
import { ExitValidator } from './modules/exit-validator';
import { StrategyValidator } from './modules/strategy-validator';

export * from './base-validator';

export const ALL_VALIDATORS: Record<string, BaseValidator> = {
  'Trend Validator': new TrendValidator(),
  'Market Structure Validator': new MarketStructureValidator(),
  'BOS Validator': new BOSValidator(),
  'CHOCH Validator': new CHOCHValidator(),
  'Liquidity Validator': new LiquidityValidator(),
  'Liquidity Sweep Validator': new LiquiditySweepValidator(),
  'Order Block Validator': new OrderBlockValidator(),
  'Breaker Block Validator': new BreakerBlockValidator(),
  'Mitigation Block Validator': new MitigationBlockValidator(),
  'Fair Value Gap Validator': new FairValueGapValidator(),
  'Premium/Discount Validator': new PremiumDiscountValidator(),
  'Fibonacci Validator': new FibonacciValidator(),
  'Volume Validator': new VolumeValidator(),
  'Volatility Validator': new VolatilityValidator(),
  'Session Validator': new SessionValidator(),
  'News Validator': new NewsValidator(),
  'Correlation Validator': new CorrelationValidator(),
  'Risk Validator': new RiskValidator(),
  'Entry Validator': new EntryValidator(),
  'Exit Validator': new ExitValidator(),
  'Strategy Validator': new StrategyValidator()
};
