import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class SumInsuredRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const claimAmount = Number(getValueByPath(claim, 'billing.totalAmount') ?? 0);
    const remainingSumInsured = Number(getValueByPath(policy.rawPolicy, 'remainingSumInsured') ?? 0);
    const totalSumInsured = Number(getValueByPath(policy.rawPolicy, 'totalSumInsured') ?? 0);
    const availableAmount = remainingSumInsured > 0 ? remainingSumInsured : totalSumInsured;

    if (claimAmount <= 0 || availableAmount <= 0) {
      return {
        rule: 'sum_insured_available',
        status: RULE_STATUS.WARNING,
        field: 'policy.remainingSumInsured',
        message: 'Available sum insured could not be verified fully from the provided documents.',
        impact: 'review',
        evidence: {
          claimAmount,
          remainingSumInsured,
          totalSumInsured
        }
      };
    }

    if (claimAmount <= availableAmount) {
      return {
        rule: 'sum_insured_available',
        status: RULE_STATUS.PASS,
        field: 'policy.remainingSumInsured',
        message: 'Available sum insured is sufficient for the current claim amount.',
        impact: 'none',
        evidence: {
          claimAmount,
          availableAmount
        }
      };
    }

    return {
      rule: 'sum_insured_available',
      status: RULE_STATUS.FAIL,
      field: 'policy.remainingSumInsured',
      message: `Claim amount ${claimAmount} exceeds available sum insured ${availableAmount}.`,
      impact: 'possible rejection',
      evidence: {
        claimAmount,
        availableAmount,
        remainingSumInsured,
        totalSumInsured
      }
    };
  }
}
