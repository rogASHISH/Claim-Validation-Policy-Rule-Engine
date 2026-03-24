import { Module } from '@nestjs/common';
import { DynamicRuleService } from './dynamic-rule.service';
import { RuleEngineService } from './rule-engine.service';
import { CoverageRule } from './rules/coverage.rule';
import { DuplicateChargeRule } from './rules/duplicate.rule';
import { RoomRentRule } from './rules/room-rent.rule';
import { WaitingPeriodRule } from './rules/waiting-period.rule';

@Module({
  providers: [
    DynamicRuleService,
    RuleEngineService,
    RoomRentRule,
    CoverageRule,
    WaitingPeriodRule,
    DuplicateChargeRule
  ],
  exports: [RuleEngineService]
})
export class RuleEngineModule {}
