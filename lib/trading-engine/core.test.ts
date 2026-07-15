import { describe, it, expect } from 'vitest';
import { RuleEngine } from './rule-engine';
import { StateMachine } from './state-machine';

describe('Rule Engine & State Machine', () => {
  it('should instantiate RuleEngine', () => {
    const ruleEngine = new RuleEngine();
    expect(ruleEngine).toBeDefined();
  });

  it('should instantiate StateMachine', () => {
    const stateMachine = new StateMachine('strategy-1-smc');
    expect(stateMachine).toBeDefined();
  });
});
