import { Injectable } from '@nestjs/common';
import { getValueByPath } from '../../common/utils/object-path.util';
import { ValidateClaimDto } from '../claim/dto/claim.dto';
import { BuiltInFieldMappings, PolicyRuleSet } from '../policy/policy.types';

export interface NormalizedClaim {
  patient: {
    id: string;
    name: string;
    gender: string;
    dob: string;
    age: number;
  };
  treatment: {
    name: string;
    estimatedCost: number;
    diagnosis: string;
  };
  billing: {
    roomRent: number;
    totalAmount: number;
    items: Array<Record<string, unknown>>;
  };
  metadata: {
    caseId: string;
    productType: string;
    dateOfAdmission: string;
    dateOfDischarge: string;
    status: string;
  };
}

export interface NormalizedPolicy {
  policyNumber: string;
  policyAgeMonths: number;
  roomRentLimit: number;
  coveredTreatments: string[];
  waitingPeriodMonths: number;
  customRules: PolicyRuleSet['customRules'];
}

export interface NormalizationResult {
  claim: NormalizedClaim;
  policy: NormalizedPolicy;
}

const CANONICAL_FIELD_MAPPINGS: BuiltInFieldMappings = {
  roomRentClaimPath: 'billing.roomRent',
  roomRentLimitPolicyPath: 'roomRentLimit',
  treatmentNameClaimPath: 'treatment.name',
  coveredTreatmentsPolicyPath: 'coveredTreatments',
  policyAgeMonthsPolicyPath: 'policyAgeMonths',
  waitingPeriodMonthsPolicyPath: 'waitingPeriodMonths',
  billingItemsClaimPath: 'billing.items'
};

@Injectable()
export class NormalizerService {
  normalize(payload: ValidateClaimDto, policyRules: PolicyRuleSet): NormalizationResult {
    const normalizedClaim: NormalizedClaim = {
      patient: {
        id: this.getFirstString(payload.claim, ['patient.id', 'patientId', 'member.externalId']),
        name: this.resolvePatientName(payload.claim),
        gender: this.getFirstString(payload.claim, [
          'patient.gender',
          'member.demographics.gender',
          'member.gender'
        ]),
        dob: this.getFirstString(payload.claim, ['patient.dob', 'member.demographics.dob']),
        age: this.resolvePatientAge(payload.claim)
      },
      treatment: {
        name:
          this.getFirstString(payload.claim, [
            policyRules.fieldMappings.treatmentNameClaimPath,
            'treatment.metaInfo.provisionalDiagnosis',
            'treatment.metaInfo.doctorPrescription',
            'treatment.metaInfo.chiefComplaint',
            'treatment.name'
          ]) || 'UNKNOWN_TREATMENT',
        estimatedCost: this.getFirstNumber(payload.claim, [
          'treatment.estimatedCost',
          'clinical.encounter.estimatedCost'
        ]),
        diagnosis: this.getFirstString(payload.claim, [
          'treatment.metaInfo.provisionalDiagnosis',
          'treatment.metaInfo.doctorPrescription',
          'treatment.metaInfo.chiefComplaint'
        ])
      },
      billing: {
        roomRent: this.getFirstNumber(payload.claim, [
          policyRules.fieldMappings.roomRentClaimPath,
          'billDetail.charges.roomRent',
          'treatment.charges.roomRent'
        ]),
        totalAmount: this.getFirstNumber(payload.claim, [
          'billDetail.finalBillAmount',
          'billDetail.partnerApprovedAmount',
          'claimDetail.settlementAmount',
          'finalApprovedAmt',
          'processorDischargeAmt',
          'underwriterDischargeAmt',
          'invoice.summary.totalClaimed',
          'billing.totalAmount'
        ]),
        items: this.getFirstArray(payload.claim, [
          policyRules.fieldMappings.billingItemsClaimPath,
          'billDetail.lineItems',
          'claimDetail.deductions',
          'casePackageDetail'
        ])
      },
      metadata: {
        caseId: this.getFirstString(payload.claim, ['id', 'internalCaseId']),
        productType: this.getFirstString(payload.claim, ['productType']),
        dateOfAdmission: this.getFirstString(payload.claim, ['dateOfAdmission']),
        dateOfDischarge: this.getFirstString(payload.claim, ['dateOfDischarge']),
        status: this.getFirstString(payload.claim, ['status'])
      }
    };

    const normalizedPolicy: NormalizedPolicy = {
      policyNumber: this.getFirstString(payload.policy, [
        'policyNumber',
        'member.policyNumber',
        'policyDetail.policyNumber'
      ]),
      policyAgeMonths: this.resolvePolicyAgeMonths(payload, policyRules),
      roomRentLimit: this.getFirstNumber(payload.policy, [
        policyRules.fieldMappings.roomRentLimitPolicyPath,
        'policyDetail.metaInfo.subLimitAmount'
      ]),
      coveredTreatments: this.getFirstStringArray(payload.policy, [
        policyRules.fieldMappings.coveredTreatmentsPolicyPath
      ]),
      waitingPeriodMonths: this.getFirstNumber(payload.policy, [
        policyRules.fieldMappings.waitingPeriodMonthsPolicyPath,
        'policyDetail.metaInfo.waitingPeriodMonths'
      ]),
      customRules: policyRules.customRules
    };

    return {
      claim: normalizedClaim,
      policy: normalizedPolicy
    };
  }

  getCanonicalFieldMappings(): BuiltInFieldMappings {
    return CANONICAL_FIELD_MAPPINGS;
  }

  private resolvePatientName(claim: Record<string, unknown>): string {
    const directName = this.getFirstString(claim, ['patient.name', 'member.demographics.fullName']);
    if (directName) {
      return directName;
    }

    const firstName = this.getFirstString(claim, ['patient.firstName']);
    const middleName = this.getFirstString(claim, ['patient.middleName']);
    const lastName = this.getFirstString(claim, ['patient.lastName']);
    return [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  }

  private resolvePatientAge(claim: Record<string, unknown>): number {
    const directAge = this.getFirstNumber(claim, ['patient.age', 'member.demographics.age']);
    if (directAge > 0) {
      return directAge;
    }

    const dob = this.getFirstString(claim, ['patient.dob', 'member.demographics.dob']);
    if (!dob) {
      return 0;
    }

    const dobDate = new Date(dob);
    if (Number.isNaN(dobDate.getTime())) {
      return 0;
    }

    const today = new Date();
    let age = today.getUTCFullYear() - dobDate.getUTCFullYear();
    const monthDelta = today.getUTCMonth() - dobDate.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < dobDate.getUTCDate())) {
      age -= 1;
    }
    return Math.max(age, 0);
  }

  private resolvePolicyAgeMonths(payload: ValidateClaimDto, policyRules: PolicyRuleSet): number {
    const directMonths = this.getFirstNumber(payload.policy, [
      policyRules.fieldMappings.policyAgeMonthsPolicyPath
    ]);

    if (directMonths > 0) {
      return directMonths;
    }

    const inceptionDate = this.getFirstString(payload.policy, [
      'inceptionDate',
      'policyDetail.inceptionDate'
    ]);
    const admissionDate = this.getFirstString(payload.claim, ['dateOfAdmission']);
    if (!inceptionDate) {
      return 0;
    }

    const fromDate = new Date(inceptionDate);
    const toDate = admissionDate ? new Date(admissionDate) : new Date();
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return 0;
    }

    return Math.max(
      (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 +
        (toDate.getUTCMonth() - fromDate.getUTCMonth()),
      0
    );
  }

  private getFirstString(source: Record<string, unknown>, paths: string[]): string {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private getFirstNumber(source: Record<string, unknown>, paths: string[]): number {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }

  private getFirstArray(source: Record<string, unknown>, paths: string[]): Array<Record<string, unknown>> {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
      }
    }
    return [];
  }

  private getFirstStringArray(source: Record<string, unknown>, paths: string[]): string[] {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (Array.isArray(value)) {
        return value.map((item) => String(item));
      }
    }
    return [];
  }
}
