import { StateMachine } from '../state-machine';
import { RuleEngine, RuleEvaluationContext } from '../rule-engine';
import { RuleResult } from '@/types';

export abstract class BaseStrategy {
  public abstract id: string;
  public abstract name: string;
  public stateMachine: StateMachine;
  protected ruleEngine: RuleEngine;
  public lastRuleResults: Record<string, RuleResult> = {};

  constructor(ruleEngine: RuleEngine, id: string) {
    this.stateMachine = new StateMachine(id);
    this.ruleEngine = ruleEngine;
  }

  abstract evaluate(context: RuleEvaluationContext): void;

  getCurrentState() {
    return this.stateMachine.getCurrentState();
  }
}
