import { StateName, StepStatus } from '@/types';

export interface StrategyState {
  stateName: StateName;
  timestamp: string;
  strategyId: string;
  signalKey?: string;
  currentStatus: StepStatus;
  reason: string;
  nextExpectedState: StateName | null;
  context?: {
    direction?: 'buy' | 'sell';
    entryPrice?: number;
    slPrice?: number;
    tp1Price?: number;
    tp2Price?: number;
    tp3Price?: number;
    positionSize?: number;
    pipsRealized?: number;
  };
}

export const STRATEGY_FLOWS: Record<string, StateName[]> = {
  'strategy-1': ['IDLE', 'WAIT_SESSION', 'WAIT_TREND', 'WAIT_LEVEL', 'WAIT_SWEEP', 'WAIT_CONFIRMATION', 'WAIT_RETEST', 'WAIT_AI', 'SIGNAL_ACTIVE', 'TAKE_PARTIAL', 'FINISHED'],
  'strategy-2': ['IDLE', 'WAIT_TREND', 'WAIT_LEVEL', 'WAIT_SWEEP', 'WAIT_CONFIRMATION', 'WAIT_AI', 'SIGNAL_ACTIVE', 'FINISHED'],
  'strategy-3': ['IDLE', 'WAIT_TREND', 'WAIT_RETRACEMENT', 'WAIT_SWEEP', 'WAIT_PATTERN', 'WAIT_NECKLINE_BREAK', 'WAIT_AI', 'SIGNAL_ACTIVE', 'FINISHED'],
  'strategy-4': ['IDLE', 'WAIT_NEWS', 'WAIT_SWEEP', 'WAIT_REJECTION', 'WAIT_STRUCTURE', 'WAIT_AI', 'SIGNAL_ACTIVE', 'FINISHED'],
};

export class StateMachine {
  private currentState: StateName;
  private strategyId: string;
  private expectedFlow: StateName[];
  private currentSignalKey: string | undefined;
  public lastTransitionState: StrategyState | null = null;

  constructor(strategyId: string, initialState: StateName = 'IDLE') {
    this.strategyId = strategyId;
    this.currentState = initialState;
    this.expectedFlow = STRATEGY_FLOWS[strategyId] || ['IDLE'];
  }

  public getCurrentState(): StateName {
    return this.currentState;
  }

  public getSignalKey(): string | undefined {
    return this.currentSignalKey;
  }

  public forceState(newState: StateName, reason: string, signalKey?: string, context?: any) {
    this.currentState = newState;
    if (signalKey) {
       this.currentSignalKey = signalKey;
    }
    if (newState === 'IDLE' || ['FINISHED', 'REJECTED', 'EXPIRED'].includes(newState)) {
       this.currentSignalKey = undefined; // reset on terminal or IDLE
    }
    
    const isTerminal = ['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(newState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerminal ? (newState === 'REJECTED' ? 'rejected' : newState === 'EXPIRED' ? 'expired' : 'active') : 'active',
      reason,
      nextExpectedState: this.getNextExpectedState(),
      context
    };
    
    this.lastTransitionState = result;
    return result;
  }

  public getNextExpectedState(): StateName | null {
    const currentIndex = this.expectedFlow.indexOf(this.currentState);
    if (currentIndex >= 0 && currentIndex < this.expectedFlow.length - 1) {
      return this.expectedFlow[currentIndex + 1];
    }
    return null;
  }

  private generateSignalKey(_context?: any): string {
     // A simple deterministic signal key generation based on strategy and timestamp
     const timeStr = new Date().getTime().toString(16);
     return `${this.strategyId}_key_${timeStr}`;
  }

  public transition(newState: StateName, reason: string, signalKey?: string, context?: any): StrategyState {
    const currentIndex = this.expectedFlow.indexOf(this.currentState);
    const newIndex = this.expectedFlow.indexOf(newState);

    const isTerminal = ['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(newState);
    const isNextSequential = newIndex === currentIndex + 1;

    // A state can transition forward in sequence or jump to a terminal state
    if (isNextSequential || isTerminal) {
      this.currentState = newState;
    } else if (newIndex > currentIndex + 1) {
      throw new Error(`Invalid transition: Cannot skip steps from ${this.currentState} to ${newState}. Flow: ${this.expectedFlow.join(',')}`);
    } else {
      throw new Error(`Invalid transition: Cannot go backward or arbitrary state from ${this.currentState} to ${newState}. Flow: ${this.expectedFlow.join(',')}`);
    }

    if (this.currentState !== 'IDLE' && currentIndex === 0) {
        // Generating initial signal key
        this.currentSignalKey = signalKey || this.generateSignalKey(context);
    } else if (signalKey) {
        this.currentSignalKey = signalKey;
    }

    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerminal ? (newState === 'REJECTED' ? 'rejected' : newState === 'EXPIRED' ? 'expired' : 'active') : 'active',
      reason,
      nextExpectedState: this.getNextExpectedState(),
      context
    };
    
    // Reset signal key after generating result if it is terminal so next run starts fresh
    if (isTerminal) {
        this.currentSignalKey = undefined;
    }
    
    this.lastTransitionState = result;
    return result;
  }
}
