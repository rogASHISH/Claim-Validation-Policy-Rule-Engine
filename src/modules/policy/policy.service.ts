import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '../../config/config.service';
import { getValueByPath } from '../../common/utils/object-path.util';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import {
  BuiltInFieldMappings,
  MappingResolutionSource,
  PolicyRuleSet
} from './policy.types';

const DEFAULT_FIELD_MAPPINGS: BuiltInFieldMappings = {
  roomRentClaimPath: 'billing.roomRent',
  roomRentLimitPolicyPath: 'roomRentLimit',
  treatmentNameClaimPath: 'treatment.name',
  coveredTreatmentsPolicyPath: 'coveredTreatments',
  policyAgeMonthsPolicyPath: 'policyAgeMonths',
  waitingPeriodMonthsPolicyPath: 'waitingPeriodMonths',
  billingItemsClaimPath: 'billing.items'
};

const CLAIM_PATH_CANDIDATES: Record<keyof Pick<
  BuiltInFieldMappings,
  'roomRentClaimPath' | 'treatmentNameClaimPath' | 'billingItemsClaimPath'
>, string[]> = {
  roomRentClaimPath: [
    'billing.roomRent',
    'invoice.stay.roomRentPerDay',
    'invoice.roomRent',
    'claim.roomRent',
    'hospitalization.roomRent',
    'stay.roomRent'
  ],
  treatmentNameClaimPath: [
    'treatment.name',
    'clinical.encounter.procedureName',
    'procedure.name',
    'treatmentDetails.name',
    'claim.treatmentName'
  ],
  billingItemsClaimPath: [
    'billing.items',
    'invoice.lineItems',
    'invoice.items',
    'bill.items',
    'charges.items'
  ]
};

const POLICY_PATH_CANDIDATES: Record<keyof Pick<
  BuiltInFieldMappings,
  'roomRentLimitPolicyPath' | 'coveredTreatmentsPolicyPath' | 'policyAgeMonthsPolicyPath' | 'waitingPeriodMonthsPolicyPath'
>, string[]> = {
  roomRentLimitPolicyPath: [
    'roomRentLimit',
    'benefits.roomRent.maxPerDay',
    'limits.roomRent',
    'coverage.roomRentLimit',
    'policy.roomRentLimit'
  ],
  coveredTreatmentsPolicyPath: [
    'coveredTreatments',
    'benefits.coveredTreatments',
    'coverage.treatments',
    'policy.coveredTreatments'
  ],
  policyAgeMonthsPolicyPath: [
    'policyAgeMonths',
    'member.tenureMonths',
    'tenureMonths',
    'policy.ageMonths',
    'member.policyAgeMonths'
  ],
  waitingPeriodMonthsPolicyPath: [
    'waitingPeriodMonths',
    'benefits.waitingPeriodMonths',
    'rules.waitingPeriodMonths',
    'policy.waitingPeriodMonths'
  ]
};

@Injectable()
export class PolicyService {
  constructor(private readonly configService: ConfigService) {}

  getPolicyRules(payload: ValidateClaimDto): PolicyRuleSet {
    const defaultPolicy = this.loadDefaultPolicy();
    const requestPolicy = payload.policy ?? {};
    const requestEngineConfig = this.getEngineConfig(requestPolicy);
    const defaultEngineConfig = this.getEngineConfig(defaultPolicy);
    const inferredFieldMappings = this.inferFieldMappings(payload.claim, requestPolicy);

    const resolvedMappings = {} as BuiltInFieldMappings;
    const mappingSources = {} as Record<keyof BuiltInFieldMappings, MappingResolutionSource>;

    (Object.keys(DEFAULT_FIELD_MAPPINGS) as Array<keyof BuiltInFieldMappings>).forEach((key) => {
      const explicitValue = requestEngineConfig.fieldMappings?.[key];
      const defaultPolicyValue = defaultEngineConfig.fieldMappings?.[key];
      const inferredValue = inferredFieldMappings[key];

      if (explicitValue) {
        resolvedMappings[key] = explicitValue;
        mappingSources[key] = 'explicit';
        return;
      }

      if (defaultPolicyValue) {
        resolvedMappings[key] = defaultPolicyValue;
        mappingSources[key] = 'default-policy';
        return;
      }

      if (inferredValue) {
        resolvedMappings[key] = inferredValue;
        mappingSources[key] = 'inferred';
        return;
      }

      resolvedMappings[key] = DEFAULT_FIELD_MAPPINGS[key];
      mappingSources[key] = 'fallback-default';
    });

    return {
      rawPolicy: requestPolicy,
      fieldMappings: resolvedMappings,
      mappingSources,
      customRules:
        requestEngineConfig.customRules?.length
          ? requestEngineConfig.customRules
          : defaultEngineConfig.customRules ?? []
    };
  }

  private loadDefaultPolicy(): Record<string, unknown> {
    const policyPath = this.configService.get('DEFAULT_POLICY_FILE');

    if (!policyPath) {
      return {};
    }

    try {
      const file = readFileSync(resolve(process.cwd(), policyPath), 'utf-8');
      return JSON.parse(file) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private getEngineConfig(policy: Record<string, unknown>): {
    fieldMappings?: Partial<BuiltInFieldMappings>;
    customRules?: PolicyRuleSet['customRules'];
  } {
    const engineConfig = policy.engineConfig;
    const topLevelCustomRules = Array.isArray(policy.customRules)
      ? (policy.customRules as PolicyRuleSet['customRules'])
      : undefined;

    if (!engineConfig || typeof engineConfig !== 'object') {
      return {
        customRules: topLevelCustomRules
      };
    }

    const resolved = engineConfig as {
      fieldMappings?: Partial<BuiltInFieldMappings>;
      customRules?: PolicyRuleSet['customRules'];
    };

    return {
      fieldMappings: resolved.fieldMappings,
      customRules: resolved.customRules?.length ? resolved.customRules : topLevelCustomRules
    };
  }

  private inferFieldMappings(
    claim: Record<string, unknown>,
    policy: Record<string, unknown>
  ): Partial<BuiltInFieldMappings> {
    return {
      roomRentClaimPath: this.findFirstExistingPath(claim, CLAIM_PATH_CANDIDATES.roomRentClaimPath),
      treatmentNameClaimPath: this.findFirstExistingPath(
        claim,
        CLAIM_PATH_CANDIDATES.treatmentNameClaimPath
      ),
      billingItemsClaimPath: this.findFirstExistingPath(
        claim,
        CLAIM_PATH_CANDIDATES.billingItemsClaimPath
      ),
      roomRentLimitPolicyPath: this.findFirstExistingPath(
        policy,
        POLICY_PATH_CANDIDATES.roomRentLimitPolicyPath
      ),
      coveredTreatmentsPolicyPath: this.findFirstExistingPath(
        policy,
        POLICY_PATH_CANDIDATES.coveredTreatmentsPolicyPath
      ),
      policyAgeMonthsPolicyPath: this.findFirstExistingPath(
        policy,
        POLICY_PATH_CANDIDATES.policyAgeMonthsPolicyPath
      ),
      waitingPeriodMonthsPolicyPath: this.findFirstExistingPath(
        policy,
        POLICY_PATH_CANDIDATES.waitingPeriodMonthsPolicyPath
      )
    };
  }

  private findFirstExistingPath(
    source: Record<string, unknown>,
    candidates: string[]
  ): string | undefined {
    return candidates.find((candidate) => getValueByPath(source, candidate) !== undefined);
  }
}
