export const TradingParameters = {
  // Strategy 1
  londonKillZone: {
    status: 'configured',
    description: 'London kill zone time window',
    value: { start: '07:00', end: '10:00' }
  },
    
  // Strategy 2
  weakEngulfingDefinition: {
    status: 'configured',
    description: 'Algorithmic definition for weak engulfing (body thickness vs wick length)',
    value: { minBodyRatio: 0.6 }
  },

  // Strategy 3
  doublePatternSymmetryTolerance: {
    status: 'configured',
    description: 'Symmetry parameter for double top / double bottom pattern validation',
    value: { tolerancePips: 20 }
  },

  // Global / Risk
  standardPipBuffer: {
    status: 'configured',
    description: 'Standard pip buffer for Stop Loss placement near wicks',
    value: { pips: 15 }
  },

  // Strategy 4
  newsScheduleConstraints: {
    status: 'configured',
    description: 'News scheduling constraints without a validated economic calendar',
    value: { minImpact: 'high', noTradeWindowMinutesBefore: 15, noTradeWindowMinutesAfter: 15 }
  }
};
