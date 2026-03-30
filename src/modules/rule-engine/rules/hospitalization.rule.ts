import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class HospitalizationRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, _policy: PolicyRuleSet): RuleResult {
    const hospitalizationHours = Number(getValueByPath(claim, 'metadata.hospitalizationHours') ?? 0);
    const isDaycare = Boolean(getValueByPath(claim, 'metadata.isDaycare'));
    const treatmentName = String(getValueByPath(claim, 'treatment.name') ?? '').toLowerCase();
    const likelyProcedureCase =
      /circumcision|surgery|procedure|ot charges|day care/i.test(treatmentName) || isDaycare;

    if (hospitalizationHours <= 0) {
      return {
        rule: 'hospitalization_eligibility',
        status: RULE_STATUS.WARNING,
        field: 'claim.metadata.hospitalizationHours',
        message: 'Hospitalization duration could not be fully derived from the uploaded documents.',
        impact: 'review',
        evidence: {
          hospitalizationHours,
          isDaycare
        }
      };
    }

    if (hospitalizationHours >= 24 || isDaycare) {
      return {
        rule: 'hospitalization_eligibility',
        status: RULE_STATUS.PASS,
        field: 'claim.metadata.hospitalizationHours',
        message: isDaycare
          ? 'Short hospitalization is acceptable because the claim appears to be daycare.'
          : 'Hospitalization duration satisfies the minimum threshold.',
        impact: 'none',
        evidence: {
          hospitalizationHours,
          isDaycare
        }
      };
    }

    if (hospitalizationHours > 0 && hospitalizationHours < 24 && likelyProcedureCase) {
      return {
        rule: 'hospitalization_eligibility',
        status: RULE_STATUS.WARNING,
        field: 'claim.metadata.hospitalizationHours',
        message: `Hospitalization duration ${hospitalizationHours.toFixed(1)} hours is short, but the claim looks procedure-based and may qualify as daycare.`,
        impact: 'review',
        evidence: {
          hospitalizationHours,
          isDaycare,
          treatmentName
        }
      };
    }

    return {
      rule: 'hospitalization_eligibility',
      status: RULE_STATUS.FAIL,
      field: 'claim.metadata.hospitalizationHours',
      message: `Hospitalization duration ${hospitalizationHours.toFixed(1)} hours is below the usual 24-hour threshold and the claim is not marked as daycare.`,
      impact: 'possible rejection',
      evidence: {
        hospitalizationHours,
        isDaycare
      }
    };
  }
}
