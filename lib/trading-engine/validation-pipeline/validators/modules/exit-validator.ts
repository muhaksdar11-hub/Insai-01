import { BaseValidator, ValidatorResult } from '../base-validator';
import { RuleResult } from '@/types';

export class ExitValidator implements BaseValidator {
  name = 'Exit Validator';
  isCritical = true;
  private ruleKeys = ['rule_exit'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (rule.status === 'valid') return { rule: this.name, status: 'PASS', reason: `${key} passed`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (rule.status === 'invalid') return { rule: this.name, status: 'FAIL', reason: `${key} failed`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting rule evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
