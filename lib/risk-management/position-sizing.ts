import { RiskContext, PositionSizingResult } from './types';
import { logger } from '../utils/logger';

export class PositionSizingEngine {
  /**
   * Calculates the position size based on account balance, risk per signal, and stop loss.
   */
  public calculateSize(
    context: RiskContext,
    riskPerSignalPercent: number
  ): PositionSizingResult {
    if (!context.entryPrice || !context.stopLoss) {
      return {
        allowed: false,
        size: 0,
        reason: 'Missing entry price or stop loss data.',
      };
    }

    const riskAmount = context.accountBalance * (riskPerSignalPercent / 100);
    const stopLossDistance = Math.abs(context.entryPrice - context.stopLoss);
    
    // Include spread and slippage in risk distance if available
    const effectiveDistance = stopLossDistance + (context.spread || 0) + (context.slippage || 0);

    if (effectiveDistance <= 0) {
      return {
        allowed: false,
        size: 0,
        reason: 'Invalid stop loss distance.',
      };
    }

    // Assuming a standard lot size logic (e.g. 1 lot = 100,000 units, standard contract size for gold can be 100 oz).
    // For simplicity, returning generic 'units' to be adjusted by account specs
    const positionSize = riskAmount / effectiveDistance;

    logger.debug(`Position sizing calculated: riskAmount=${riskAmount}, distance=${effectiveDistance}, size=${positionSize}`);

    return {
      allowed: true,
      size: positionSize,
      reason: 'Calculated successfully.',
    };
  }
}

export const positionSizingEngine = new PositionSizingEngine();
