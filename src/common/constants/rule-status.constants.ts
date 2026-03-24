export const RULE_STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING'
} as const;

export type RuleStatus = (typeof RULE_STATUS)[keyof typeof RULE_STATUS];
