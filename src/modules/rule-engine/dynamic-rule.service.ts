import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../common/constants/rule-status.constants';
import { getValueByPath } from '../../common/utils/object-path.util';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { DynamicPolicyRule, PolicyRuleSet } from '../policy/policy.types';
import { RuleResult } from './rule.types';

@Injectable()
export class DynamicRuleService {
  evaluateRules(payload: ValidateClaimDto, policy: PolicyRuleSet): RuleResult[] {
    return policy.customRules.map((rule) => this.evaluateRule(rule, payload, policy));
  }

  private evaluateRule(
    rule: DynamicPolicyRule,
    payload: ValidateClaimDto,
    policy: PolicyRuleSet
  ): RuleResult {
    const leftValue = getValueByPath(payload.claim, rule.field);
    const rightValue =
      rule.referenceField !== undefined
        ? getValueByPath({ claim: payload.claim, policy: policy.rawPolicy }, rule.referenceField)
        : rule.expectedValue;
    const passed = this.runOperator(rule.operator, leftValue, rightValue);

    if (passed) {
      return {
        rule: rule.code,
        status: RULE_STATUS.PASS,
        field: rule.field,
        message: rule.message || `${rule.code} passed.`,
        impact: 'none'
      };
    }

    return {
      rule: rule.code,
      status: rule.failureStatus || RULE_STATUS.FAIL,
      field: rule.field,
      message:
        rule.message ||
        `${rule.code} failed for field "${rule.field}" with operator "${rule.operator}".`,
      impact: rule.impact || 'possible rejection'
    };
  }

  private runOperator(operator: DynamicPolicyRule['operator'], left: unknown, right: unknown): boolean {
    switch (operator) {
      case 'eq':
        return left === right;
      case 'neq':
        return left !== right;
      case 'gt':
        return Number(left) > Number(right);
      case 'gte':
        return Number(left) >= Number(right);
      case 'lt':
        return Number(left) < Number(right);
      case 'lte':
        return Number(left) <= Number(right);
      case 'in':
        return Array.isArray(right) ? right.includes(left) : false;
      case 'not_in':
        return Array.isArray(right) ? !right.includes(left) : true;
      case 'includes':
        return Array.isArray(left)
          ? left.includes(right)
          : typeof left === 'string' && right !== undefined
            ? left.includes(String(right))
            : false;
      case 'not_includes':
        return Array.isArray(left)
          ? !left.includes(right)
          : typeof left === 'string' && right !== undefined
            ? !left.includes(String(right))
            : true;
      case 'exists':
        return left !== undefined && left !== null;
      case 'not_exists':
        return left === undefined || left === null;
      default:
        return false;
    }
  }
}
