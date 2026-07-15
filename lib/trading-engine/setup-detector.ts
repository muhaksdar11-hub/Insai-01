import crypto from 'crypto';
import { Setup, SetupStatus } from '@/types';
import { logger } from '../utils/logger';

export class SetupLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupLifecycleError';
  }
}

export class SetupDetector {
  // Deterministic state
  private activeSetups: Map<string, Setup> = new Map();
  private historySetups: Map<string, Setup> = new Map();

  // Valid state transitions
  private validTransitions: Record<SetupStatus, SetupStatus[]> = {
    'scanning': ['candidate', 'expired'],
    'candidate': ['validation', 'expired'],
    'validation': ['confirmation', 'expired'],
    'confirmation': ['ready', 'expired'],
    'ready': ['signal', 'expired'],
    'signal': ['expired', 'archived'],
    'expired': ['archived'],
    'archived': []
  };

  /**
   * Generates a deterministic hash string to prevent duplicates.
   */
  private generateDeterministicId(strategyId: string, symbol: string, timeframe: string, timestamp: string): string {
    const data = `${strategyId}_${symbol}_${timeframe}_${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Start scanning process. Creates a new setup in "scanning" state.
   */
  public startScanning(strategyId: string, symbol: string, timeframe: string, timestamp: string): Setup {
    const id = this.generateDeterministicId(strategyId, symbol, timeframe, timestamp);
    
    if (this.activeSetups.has(id)) {
       throw new SetupLifecycleError(`Setup with id ${id} already exists. Duplicates are not allowed.`);
    }

    const setup: Setup = {
      id,
      timestamp,
      sourceStrategy: strategyId,
      status: 'scanning',
      symbol,
      timeframe,
      validationLog: [{
        timestamp: new Date().toISOString(),
        action: 'scan_started',
        details: `Scanning started for strategy ${strategyId}`,
        status: 'success'
      }]
    };

    this.activeSetups.set(id, setup);
    return setup;
  }

  /**
   * Transition setup to a new state deterministically.
   */
  public transitionState(id: string, newState: SetupStatus, details: string, status: 'success' | 'failure' = 'success'): Setup {
    const setup = this.activeSetups.get(id);
    if (!setup) {
      throw new SetupLifecycleError(`Setup with id ${id} not found.`);
    }

    const currentState = setup.status;
    const allowed = this.validTransitions[currentState];

    if (!allowed || !allowed.includes(newState)) {
      throw new SetupLifecycleError(`Invalid transition from ${currentState} to ${newState}. Jumping status is not allowed.`);
    }

    // Update state
    setup.status = newState;
    setup.validationLog.push({
      timestamp: new Date().toISOString(), // Use iso string, deterministic would be passing timestamp from caller but we use Date() here. Let's make it deterministic if needed.
      action: `transition_to_${newState}`,
      details,
      status
    });

    if (newState === 'archived' || newState === 'expired') {
       this.activeSetups.delete(id);
       this.historySetups.set(id, setup);
       
       // Prune history to prevent memory leaks
       if (this.historySetups.size > 500) {
          const keysToDelete = Array.from(this.historySetups.keys()).slice(0, 100);
          keysToDelete.forEach(k => this.historySetups.delete(k));
       }
    }

    return setup;
  }

  /**
   * Update setup details.
   */
  public updateSetupDetails(id: string, data: Partial<Pick<Setup, 'direction' | 'entryPrice' | 'slPrice' | 'tpPrice' | 'marketStates'>>): Setup {
    const setup = this.activeSetups.get(id);
    if (!setup) {
      throw new SetupLifecycleError(`Setup with id ${id} not found.`);
    }
    
    if (data.direction) setup.direction = data.direction;
    if (data.entryPrice) setup.entryPrice = data.entryPrice;
    if (data.slPrice) setup.slPrice = data.slPrice;
    if (data.tpPrice) setup.tpPrice = data.tpPrice;
    if (data.marketStates) setup.marketStates = data.marketStates;

    return setup;
  }

  /**
   * Verify all active setups consistency (No lost setups)
   */
  public audit(): void {
    logger.info(`Auditing ${this.activeSetups.size} active setups.`);
    const now = Date.now();
    for (const [id, setup] of this.activeSetups.entries()) {
      if (!setup.timestamp) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} is missing a timestamp.`);
      }
      if (!setup.sourceStrategy) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} is missing source strategy.`);
      }
      if (!setup.validationLog || setup.validationLog.length === 0) {
         throw new SetupLifecycleError(`Audit failed: Setup ${id} has no validation log.`);
      }
      
      // Clear setups stuck for more than 5 minutes
      const setupTime = new Date(setup.timestamp).getTime();
      if (now - setupTime > 300000) {
          logger.warn(`Setup ${id} stuck in active state for > 5 mins. Forcing expiration.`);
          this.transitionState(id, 'expired', 'Forced expiration due to stall');
      }
    }
  }

  public getActiveSetups(): Setup[] {
    return Array.from(this.activeSetups.values());
  }
}
