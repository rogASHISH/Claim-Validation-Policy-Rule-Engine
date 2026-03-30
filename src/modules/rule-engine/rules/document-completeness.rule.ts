import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { ClaimValidationRule, RuleResult } from '../rule.types';
import { PolicyRuleSet } from '../../policy/policy.types';

@Injectable()
export class DocumentCompletenessRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, _policy: PolicyRuleSet): RuleResult {
    const documents = (getValueByPath(claim, 'documents') ?? {}) as Record<string, unknown>;
    const missingMandatory = [
      !documents.hasDischargeSummary ? 'discharge summary' : '',
      !documents.hasFinalBill ? 'final bill' : ''
    ].filter(Boolean);
    const missingSupport = [
      !documents.hasItemizedBill ? 'itemized bill' : '',
      !documents.hasPrescription ? 'doctor prescription' : '',
      !documents.hasInvestigationReport ? 'investigation report' : ''
    ].filter(Boolean);

    if (missingMandatory.length > 0) {
      return {
        rule: 'document_completeness',
        status: RULE_STATUS.FAIL,
        field: 'claim.documents',
        message: `Mandatory claim documents are missing: ${missingMandatory.join(', ')}.`,
        impact: 'possible rejection',
        evidence: {
          documents
        }
      };
    }

    if (missingSupport.length > 0) {
      return {
        rule: 'document_completeness',
        status: RULE_STATUS.WARNING,
        field: 'claim.documents',
        message: `Some supporting claim documents are missing: ${missingSupport.join(', ')}.`,
        impact: 'review',
        evidence: {
          documents
        }
      };
    }

    return {
      rule: 'document_completeness',
      status: RULE_STATUS.PASS,
      field: 'claim.documents',
      message: 'Core claim documents required for review are present.',
      impact: 'none',
      evidence: {
        documents
      }
    };
  }
}
