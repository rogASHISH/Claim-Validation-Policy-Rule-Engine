import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class PolicyValidityRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const admissionDateRaw = getValueByPath(claim, 'metadata.dateOfAdmission');
    const dischargeDateRaw = getValueByPath(claim, 'metadata.dateOfDischarge');
    const inceptionDateRaw = getValueByPath(policy.rawPolicy, 'inceptionDate');
    const expiryDateRaw = getValueByPath(policy.rawPolicy, 'expiryDate');
    const policyActive = Boolean(getValueByPath(policy.rawPolicy, 'policyActive'));
    const admissionDate = this.toDate(admissionDateRaw);
    const dischargeDate = this.toDate(dischargeDateRaw);
    const inceptionDate = this.toDate(inceptionDateRaw);
    const expiryDate = this.toDate(expiryDateRaw);

    if (!admissionDate || !inceptionDate || !expiryDate) {
      return {
        rule: 'policy_validity',
        status: RULE_STATUS.WARNING,
        field: 'policy.policyPeriod',
        message: 'Policy period could not be fully verified from the uploaded documents.',
        impact: 'review',
        evidence: {
          admissionDate: String(admissionDateRaw ?? ''),
          inceptionDate: String(inceptionDateRaw ?? ''),
          expiryDate: String(expiryDateRaw ?? '')
        }
      };
    }

    const admissionCovered = admissionDate >= inceptionDate && admissionDate <= expiryDate;
    const dischargeCovered = !dischargeDate || dischargeDate <= expiryDate;

    if (policyActive && admissionCovered && dischargeCovered) {
      return {
        rule: 'policy_validity',
        status: RULE_STATUS.PASS,
        field: 'policy.policyPeriod',
        message: 'Admission and discharge dates fall within the active policy period.',
        impact: 'none',
        evidence: {
          admissionDate: admissionDate.toISOString(),
          dischargeDate: dischargeDate?.toISOString() ?? '',
          inceptionDate: inceptionDate.toISOString(),
          expiryDate: expiryDate.toISOString()
        }
      };
    }

    return {
      rule: 'policy_validity',
      status: RULE_STATUS.FAIL,
      field: 'policy.policyPeriod',
      message: 'Claim dates do not fall within the active policy period.',
      impact: 'possible rejection',
      evidence: {
        policyActive,
        admissionDate: admissionDate.toISOString(),
        dischargeDate: dischargeDate?.toISOString() ?? '',
        inceptionDate: inceptionDate.toISOString(),
        expiryDate: expiryDate.toISOString()
      }
    };
  }

  private toDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
