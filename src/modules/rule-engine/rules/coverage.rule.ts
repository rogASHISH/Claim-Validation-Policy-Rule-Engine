import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { PolicyRuleSet } from '../../policy/policy.types';
import { ClaimValidationRule, RuleResult } from '../rule.types';

@Injectable()
export class CoverageRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const treatmentName = String(
      getValueByPath(claim, policy.fieldMappings.treatmentNameClaimPath) ?? ''
    ).trim();
    const coveredTreatments = getValueByPath(
      policy.rawPolicy,
      policy.fieldMappings.coveredTreatmentsPolicyPath
    );
    const normalizedCoveredTreatments = Array.isArray(coveredTreatments)
      ? coveredTreatments.map((value) => String(value).trim().toLowerCase())
      : [];
    const isCovered = normalizedCoveredTreatments.includes(treatmentName.toLowerCase());

    if (isCovered) {
      return {
        rule: 'coverage',
        status: RULE_STATUS.PASS,
        field: policy.fieldMappings.treatmentNameClaimPath,
        message: 'Treatment is covered by the policy.',
        impact: 'none'
      };
    }

    return {
      rule: 'coverage',
      status: RULE_STATUS.FAIL,
      field: policy.fieldMappings.treatmentNameClaimPath,
      message: `Treatment "${treatmentName}" is not covered by the policy.`,
      impact: 'possible rejection'
    };
  }
}
