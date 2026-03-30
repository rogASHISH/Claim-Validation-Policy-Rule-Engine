import { RuleStatus } from '../../common/constants/rule-status.constants';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { DynamicPolicyRule, PolicyRuleSet } from '../policy/policy.types';

export interface RuleResult {
  rule: string;
  status: RuleStatus;
  field: string;
  message: string;
  impact: 'none' | 'review' | 'partial approval' | 'possible rejection';
  evidence?: Record<string, unknown>;
}

export interface ClaimValidationRule {
  evaluate(claim: Record<string, unknown>, policy: PolicyRuleSet): RuleResult;
}

export interface DynamicRuleEvaluationContext {
  claim: ValidateClaimDto;
  policy: PolicyRuleSet;
  rule: DynamicPolicyRule;
}
