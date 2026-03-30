import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { PolicyRuleSet } from '../../policy/policy.types';
import { ClaimValidationRule, RuleResult } from '../rule.types';

@Injectable()
export class DuplicateChargeRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const items = getValueByPath(claim, policy.fieldMappings.billingItemsClaimPath);
    const billingItems = Array.isArray(items) ? items : [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    billingItems.forEach((item) => {
      const billingItem = item as Record<string, unknown>;
      const composite = `${billingItem.code ?? ''}:${billingItem.description ?? ''}:${billingItem.amount ?? ''}`;
      if (seen.has(composite)) {
        duplicates.add(String(billingItem.code ?? 'UNKNOWN'));
      } else {
        seen.add(composite);
      }
    });

    if (duplicates.size === 0) {
      return {
        rule: 'duplicate_charge',
        status: RULE_STATUS.PASS,
        field: policy.fieldMappings.billingItemsClaimPath,
        message: 'No duplicate billing items detected.',
        impact: 'none',
        evidence: {
          billingItemCount: billingItems.length,
          duplicates: []
        }
      };
    }

    return {
      rule: 'duplicate_charge',
      status: RULE_STATUS.WARNING,
      field: policy.fieldMappings.billingItemsClaimPath,
      message: `Duplicate billing items detected for codes: ${Array.from(duplicates).join(', ')}.`,
      impact: 'review',
      evidence: {
        billingItemCount: billingItems.length,
        duplicates: Array.from(duplicates)
      }
    };
  }
}
