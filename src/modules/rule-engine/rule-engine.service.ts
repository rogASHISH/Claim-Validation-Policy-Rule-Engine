import { Injectable } from '@nestjs/common';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { PolicyRuleSet } from '../policy/policy.types';
import { DynamicRuleService } from './dynamic-rule.service';
import { CoverageRule } from './rules/coverage.rule';
import { DuplicateChargeRule } from './rules/duplicate.rule';
import { RoomRentRule } from './rules/room-rent.rule';
import { WaitingPeriodRule } from './rules/waiting-period.rule';
import { RuleResult } from './rule.types';

@Injectable()
export class RuleEngineService {
  constructor(
    private readonly roomRentRule: RoomRentRule,
    private readonly coverageRule: CoverageRule,
    private readonly waitingPeriodRule: WaitingPeriodRule,
    private readonly duplicateChargeRule: DuplicateChargeRule,
    private readonly dynamicRuleService: DynamicRuleService
  ) {}

  evaluate(payload: ValidateClaimDto, policy: PolicyRuleSet): RuleResult[] {
    return [
      this.roomRentRule.evaluate(payload.claim, policy),
      this.coverageRule.evaluate(payload.claim, policy),
      this.waitingPeriodRule.evaluate(payload.claim, policy),
      this.duplicateChargeRule.evaluate(payload.claim, policy),
      ...this.dynamicRuleService.evaluateRules(payload, policy)
    ];
  }
}
