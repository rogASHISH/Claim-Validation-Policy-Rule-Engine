import { Injectable } from '@nestjs/common';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { PolicyRuleSet } from '../policy/policy.types';
import { DynamicRuleService } from './dynamic-rule.service';
import { CoverageRule } from './rules/coverage.rule';
import { DocumentCompletenessRule } from './rules/document-completeness.rule';
import { DuplicateChargeRule } from './rules/duplicate.rule';
import { BillingComplianceRule } from './rules/billing-compliance.rule';
import { HospitalizationRule } from './rules/hospitalization.rule';
import { InsuredMemberRule } from './rules/insured-member.rule';
import { PolicyValidityRule } from './rules/policy-validity.rule';
import { RoomRentRule } from './rules/room-rent.rule';
import { SumInsuredRule } from './rules/sum-insured.rule';
import { WaitingPeriodRule } from './rules/waiting-period.rule';
import { RuleResult } from './rule.types';

@Injectable()
export class RuleEngineService {
  constructor(
    private readonly roomRentRule: RoomRentRule,
    private readonly coverageRule: CoverageRule,
    private readonly waitingPeriodRule: WaitingPeriodRule,
    private readonly duplicateChargeRule: DuplicateChargeRule,
    private readonly policyValidityRule: PolicyValidityRule,
    private readonly insuredMemberRule: InsuredMemberRule,
    private readonly sumInsuredRule: SumInsuredRule,
    private readonly hospitalizationRule: HospitalizationRule,
    private readonly documentCompletenessRule: DocumentCompletenessRule,
    private readonly billingComplianceRule: BillingComplianceRule,
    private readonly dynamicRuleService: DynamicRuleService
  ) {}

  evaluate(payload: ValidateClaimDto, policy: PolicyRuleSet): RuleResult[] {
    return [
      this.policyValidityRule.evaluate(payload.claim, policy),
      this.insuredMemberRule.evaluate(payload.claim, policy),
      this.sumInsuredRule.evaluate(payload.claim, policy),
      this.hospitalizationRule.evaluate(payload.claim, policy),
      this.documentCompletenessRule.evaluate(payload.claim, policy),
      this.roomRentRule.evaluate(payload.claim, policy),
      this.coverageRule.evaluate(payload.claim, policy),
      this.waitingPeriodRule.evaluate(payload.claim, policy),
      this.duplicateChargeRule.evaluate(payload.claim, policy),
      this.billingComplianceRule.evaluate(payload.claim, policy),
      ...this.dynamicRuleService.evaluateRules(payload, policy)
    ];
  }
}
