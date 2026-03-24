import { Injectable } from '@nestjs/common';
import { flattenObject } from '../../common/utils/flatten.util';

export interface ComparisonInsight {
  field: string;
  claimValue: unknown;
  policyValue: unknown;
}

@Injectable()
export class ComparatorService {
  compareClaimAgainstPolicy(
    claim: object,
    policy: object
  ): ComparisonInsight[] {
    const flattenedClaim = flattenObject(claim as Record<string, unknown>);
    const flattenedPolicy = flattenObject(policy as Record<string, unknown>);

    return Object.entries(flattenedClaim)
      .filter(([field]) => field in flattenedPolicy)
      .map(([field, claimValue]) => ({
        field,
        claimValue,
        policyValue: flattenedPolicy[field]
      }));
  }
}
