import { Injectable } from '@nestjs/common';
import { RULE_STATUS } from '../../common/constants/rule-status.constants';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { ComparatorService } from '../comparator/comparator.service';
import { NormalizerService } from '../normalizer/normalizer.service';
import { PolicyService } from '../policy/policy.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';

@Injectable()
export class PipelineService {
  constructor(
    private readonly policyService: PolicyService,
    private readonly normalizerService: NormalizerService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly comparatorService: ComparatorService
  ) {}

  validateClaim(payload: ValidateClaimDto) {
    const rawPolicyRules = this.policyService.getPolicyRules(payload);
    const normalized = this.normalizerService.normalize(payload, rawPolicyRules);
    const normalizedPolicyRules = {
      ...rawPolicyRules,
      rawPolicy: normalized.policy as unknown as Record<string, unknown>,
      fieldMappings: this.normalizerService.getCanonicalFieldMappings()
    };
    const normalizedPayload: ValidateClaimDto = {
      claim: normalized.claim as unknown as Record<string, unknown>,
      policy: normalized.policy as unknown as Record<string, unknown>
    };
    const ruleResults = this.ruleEngineService.evaluate(normalizedPayload, normalizedPolicyRules);
    const matchedContext = this.comparatorService.compareClaimAgainstPolicy(
      normalized.claim,
      normalized.policy
    );
    const failedRules = ruleResults.filter((result) => result.status === RULE_STATUS.FAIL);
    const warningRules = ruleResults.filter((result) => result.status === RULE_STATUS.WARNING);

    return {
      status:
        failedRules.length > 0
          ? 'REJECTION_RISK'
          : warningRules.length > 0
            ? 'REVIEW_REQUIRED'
            : 'CLEARED',
      summary: {
        totalRules: ruleResults.length,
        passed: ruleResults.filter((result) => result.status === RULE_STATUS.PASS).length,
        failed: failedRules.length,
        warnings: warningRules.length
      },
      resolvedMappings: rawPolicyRules.fieldMappings,
      mappingSources: rawPolicyRules.mappingSources,
      normalizedClaim: normalized.claim,
      normalizedPolicy: normalized.policy,
      issues: [...failedRules, ...warningRules],
      ruleResults,
      matchedContext
    };
  }
}
