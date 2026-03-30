import { Module } from '@nestjs/common';
import { DynamicRuleService } from './dynamic-rule.service';
import { RuleEngineService } from './rule-engine.service';
import { BillingComplianceRule } from './rules/billing-compliance.rule';
import { CoverageRule } from './rules/coverage.rule';
import { DocumentCompletenessRule } from './rules/document-completeness.rule';
import { DuplicateChargeRule } from './rules/duplicate.rule';
import { HospitalizationRule } from './rules/hospitalization.rule';
import { InsuredMemberRule } from './rules/insured-member.rule';
import { PolicyValidityRule } from './rules/policy-validity.rule';
import { RoomRentRule } from './rules/room-rent.rule';
import { SumInsuredRule } from './rules/sum-insured.rule';
import { WaitingPeriodRule } from './rules/waiting-period.rule';

@Module({
  providers: [
    DynamicRuleService,
    RuleEngineService,
    RoomRentRule,
    CoverageRule,
    WaitingPeriodRule,
    DuplicateChargeRule,
    PolicyValidityRule,
    InsuredMemberRule,
    SumInsuredRule,
    HospitalizationRule,
    DocumentCompletenessRule,
    BillingComplianceRule
  ],
  exports: [RuleEngineService]
})
export class RuleEngineModule {}
