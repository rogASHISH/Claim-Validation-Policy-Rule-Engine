import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../../common/constants/rule-status.constants';
import { getValueByPath } from '../../../common/utils/object-path.util';
import { PolicyRuleSet } from '../../policy/policy.types';
import { ClaimValidationRule, RuleResult } from '../rule.types';

@Injectable()
export class RoomRentRule implements ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult {
    const roomRent = Number(getValueByPath(claim, policy.fieldMappings.roomRentClaimPath) ?? 0);
    const limit = Number(
      getValueByPath(policy.rawPolicy, policy.fieldMappings.roomRentLimitPolicyPath) ?? 0
    );
    const roomRentCoverage = String(policy.rawPolicy.roomRentCoverage ?? '').trim();

    if (
      limit <= 0 &&
      /sum insured|all categories covered|no limit/i.test(roomRentCoverage)
    ) {
      return {
        rule: 'room_rent_limit',
        status: RULE_STATUS.PASS,
        field: policy.fieldMappings.roomRentClaimPath,
        message: 'Room rent appears covered by policy wording without a numeric cap.',
        impact: 'none',
        evidence: {
          roomRent,
          limit,
          roomRentCoverage
        }
      };
    }

    if (limit <= 0) {
      return {
        rule: 'room_rent_limit',
        status: RULE_STATUS.WARNING,
        field: policy.fieldMappings.roomRentClaimPath,
        message: 'Room rent limit could not be derived clearly from the policy documents.',
        impact: 'review',
        evidence: {
          roomRent,
          limit,
          roomRentCoverage
        }
      };
    }

    if (roomRent <= limit) {
      return {
        rule: 'room_rent_limit',
        status: RULE_STATUS.PASS,
        field: policy.fieldMappings.roomRentClaimPath,
        message: 'Room rent is within the allowed policy threshold.',
        impact: 'none',
        evidence: {
          roomRent,
          limit,
          roomRentCoverage
        }
      };
    }

    return {
      rule: 'room_rent_limit',
      status: RULE_STATUS.FAIL,
      field: policy.fieldMappings.roomRentClaimPath,
      message: `Room rent ${roomRent} exceeds policy limit ${limit}.`,
      impact: 'partial approval',
      evidence: {
        roomRent,
        limit,
        proportionateDeductionRatio:
          roomRent > 0 && limit > 0 ? Number((limit / roomRent).toFixed(2)) : 0
      }
    };
  }
}
