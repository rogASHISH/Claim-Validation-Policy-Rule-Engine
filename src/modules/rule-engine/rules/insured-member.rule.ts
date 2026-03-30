import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class InsuredMemberRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const patientName = String(getValueByPath(claim, 'patient.name') ?? '').trim();
    const rawListedInsured = getValueByPath(policy.rawPolicy, 'listedInsuredPersons');
    const listedInsuredPersons = Array.isArray(rawListedInsured)
      ? rawListedInsured.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!patientName || listedInsuredPersons.length === 0) {
      return {
        rule: 'insured_member_match',
        status: RULE_STATUS.WARNING,
        field: 'policy.listedInsuredPersons',
        message: 'Insured member list could not be fully verified from the available policy data.',
        impact: 'review',
        evidence: {
          patientName,
          listedInsuredPersons
        }
      };
    }

    const normalizedPatient = this.normalize(patientName);
    const isMatch = listedInsuredPersons.some((name) => {
      const normalizedInsured = this.normalize(name);
      const patientTokens = normalizedPatient.split(' ').filter(Boolean);
      const insuredTokens = normalizedInsured.split(' ').filter(Boolean);
      const tokenOverlap = patientTokens.filter((token) => insuredTokens.includes(token));
      return (
        normalizedInsured === normalizedPatient ||
        normalizedInsured.includes(normalizedPatient) ||
        normalizedPatient.includes(normalizedInsured) ||
        tokenOverlap.length >= Math.min(2, patientTokens.length)
      );
    });

    if (isMatch) {
      return {
        rule: 'insured_member_match',
        status: RULE_STATUS.PASS,
        field: 'policy.listedInsuredPersons',
        message: 'The patient appears in the insured member list.',
        impact: 'none',
        evidence: {
          patientName,
          listedInsuredPersons
        }
      };
    }

    return {
      rule: 'insured_member_match',
      status: RULE_STATUS.FAIL,
      field: 'policy.listedInsuredPersons',
      message: 'The patient name does not match any insured person found in the policy.',
      impact: 'possible rejection',
      evidence: {
        patientName,
        listedInsuredPersons
      }
    };
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b(mr|mrs|ms|miss|dr)\b/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
