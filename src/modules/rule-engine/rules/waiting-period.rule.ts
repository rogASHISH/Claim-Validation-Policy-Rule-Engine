import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { PolicyRuleSet } from '../../policy/policy.types';
import { ClaimValidationRule, RuleResult } from '../rule.types';

@Injectable()
export class WaitingPeriodRule implements ClaimValidationRule {
  evaluate(_claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const policyAgeMonths = Number(
      getValueByPath(policy.rawPolicy, policy.fieldMappings.policyAgeMonthsPolicyPath) ?? 0
    );
    const waitingPeriodMonths = Number(
      getValueByPath(policy.rawPolicy, policy.fieldMappings.waitingPeriodMonthsPolicyPath) ?? 0
    );

    if (policyAgeMonths >= waitingPeriodMonths) {
      return {
        rule: 'waiting_period',
        status: RULE_STATUS.PASS,
        field: `policy.${policy.fieldMappings.policyAgeMonthsPolicyPath}`,
        message: 'Waiting period requirement is satisfied.',
        impact: 'none',
        evidence: {
          policyAgeMonths,
          waitingPeriodMonths,
          waitingPeriodBreakdown: policy.rawPolicy.waitingPeriodBreakdown ?? {}
        }
      };
    }

    return {
      rule: 'waiting_period',
      status: RULE_STATUS.FAIL,
      field: `policy.${policy.fieldMappings.policyAgeMonthsPolicyPath}`,
      message: `Policy age ${policyAgeMonths} months is below required waiting period ${waitingPeriodMonths} months.`,
      impact: 'possible rejection',
      evidence: {
        policyAgeMonths,
        waitingPeriodMonths,
        waitingPeriodBreakdown: policy.rawPolicy.waitingPeriodBreakdown ?? {}
      }
    };
  }
}
