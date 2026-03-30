import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class BillingComplianceRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, _policy: PolicyRuleSet): RuleResult {
    const rawItems = getValueByPath(claim, 'billing.nonPayableItems');
    const nonPayableItems = Array.isArray(rawItems)
      ? rawItems.map((value: unknown) => String(value))
      : [];

    if (nonPayableItems.length === 0) {
      return {
        rule: 'billing_compliance',
        status: RULE_STATUS.PASS,
        field: 'claim.billing.nonPayableItems',
        message: 'No obvious non-payable billing items were detected.',
        impact: 'none',
        evidence: {
          nonPayableItems: []
        }
      };
    }

    return {
      rule: 'billing_compliance',
      status: RULE_STATUS.WARNING,
      field: 'claim.billing.nonPayableItems',
      message: `Potential non-payable billing items detected: ${nonPayableItems.join(', ')}.`,
      impact: 'partial approval',
      evidence: {
        nonPayableItems
      }
    };
  }
}
