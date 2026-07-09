import { RuleResult } from '@/types';

export interface ValidatorResult {
  rule: string;
  status: 'PASS' | 'FAIL' | 'WAIT';
  reason: string;
  evidence: string;
  isCritical?: boolean;
}

export interface BaseValidator {
  name: string;
  isCritical: boolean;
  validate(ruleResults: Record<string, RuleResult>, marketContext: any): ValidatorResult;
}
