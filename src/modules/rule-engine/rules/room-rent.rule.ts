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

    if (roomRent <= limit) {
      return {
        rule: 'room_rent_limit',
        status: RULE_STATUS.PASS,
        field: policy.fieldMappings.roomRentClaimPath,
        message: 'Room rent is within the allowed policy threshold.',
        impact: 'none'
      };
    }

    return {
      rule: 'room_rent_limit',
      status: RULE_STATUS.FAIL,
      field: policy.fieldMappings.roomRentClaimPath,
      message: `Room rent ${roomRent} exceeds policy limit ${limit}.`,
      impact: 'partial approval'
    };
  }
}
