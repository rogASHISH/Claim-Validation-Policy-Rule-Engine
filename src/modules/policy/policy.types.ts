import { RuleStatus } from '../../common/constants/rule-status.constants';

export interface DynamicPolicyRule {
  code: string;
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'not_in'
    | 'includes'
    | 'not_includes'
    | 'exists'
    | 'not_exists';
  referenceField?: string;
  expectedValue?: unknown;
  failureStatus?: Exclude<RuleStatus, 'PASS'>;
  impact?: 'none' | 'review' | 'partial approval' | 'possible rejection';
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface BuiltInFieldMappings {
  roomRentClaimPath: string;
  roomRentLimitPolicyPath: string;
  treatmentNameClaimPath: string;
  coveredTreatmentsPolicyPath: string;
  policyAgeMonthsPolicyPath: string;
  waitingPeriodMonthsPolicyPath: string;
  billingItemsClaimPath: string;
}

export type MappingResolutionSource =
  | 'explicit'
  | 'default-policy'
  | 'inferred'
  | 'fallback-default';

export interface PolicyRuleSet {
  rawPolicy: Record<string, unknown>;
  fieldMappings: BuiltInFieldMappings;
  mappingSources: Record<keyof BuiltInFieldMappings, MappingResolutionSource>;
  customRules: DynamicPolicyRule[];
}
