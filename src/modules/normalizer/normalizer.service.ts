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
    nonPayableItems: string[];
  };
  metadata: {
    caseId: string;
    productType: string;
    dateOfAdmission: string;
    dateOfDischarge: string;
    status: string;
    hospitalizationHours: number;
    admissionType: string;
    isDaycare: boolean;
  };
  documents: {
    filenames: string[];
    hasDischargeSummary: boolean;
    hasFinalBill: boolean;
    hasItemizedBill: boolean;
    hasClaimForm: boolean;
    hasPrescription: boolean;
    hasInvestigationReport: boolean;
  };
}

export interface NormalizedPolicy {
  policyNumber: string;
  policyAgeMonths: number;
  roomRentLimit: number;
  coveredTreatments: string[];
  waitingPeriodMonths: number;
  inceptionDate: string;
  expiryDate: string;
  totalSumInsured: number;
  remainingSumInsured: number;
  policyType: string;
  policyActive: boolean;
  listedInsuredPersons: string[];
  roomRentCoverage: string;
  waitingPeriodBreakdown: Record<string, unknown>;
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
        ]),
        nonPayableItems: this.findNonPayableItems(
          this.getFirstArray(payload.claim, [
            policyRules.fieldMappings.billingItemsClaimPath,
            'billDetail.lineItems',
            'claimDetail.deductions',
            'casePackageDetail'
          ])
        )
      },
      metadata: {
        caseId: this.getFirstString(payload.claim, ['id', 'internalCaseId']),
        productType: this.getFirstString(payload.claim, ['productType']),
        dateOfAdmission: this.getFirstString(payload.claim, ['dateOfAdmission']),
        dateOfDischarge: this.getFirstString(payload.claim, ['dateOfDischarge']),
        status: this.getFirstString(payload.claim, ['status']),
        hospitalizationHours: this.resolveHospitalizationHours(payload.claim),
        admissionType: this.getFirstString(payload.claim, [
          'metaInfo.caseSubType',
          'metadata.admissionType',
          'admissionType'
        ]),
        isDaycare: this.resolveIsDaycare(payload.claim)
      },
      documents: {
        filenames: this.getFirstStringArray(payload.claim, ['sourceDocuments.filenames']),
        hasDischargeSummary: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasDischargeSummary']),
        hasFinalBill: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasFinalBill']),
        hasItemizedBill: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasItemizedBill']),
        hasClaimForm: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasClaimForm']),
        hasPrescription: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasPrescription']),
        hasInvestigationReport: this.getFirstBoolean(payload.claim, ['sourceDocuments.hasInvestigationReport'])
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
      inceptionDate: this.getFirstString(payload.policy, ['policyDetail.inceptionDate', 'inceptionDate']),
      expiryDate: this.getFirstString(payload.policy, ['policyDetail.expiryDate', 'expiryDate']),
      totalSumInsured: this.getFirstNumber(payload.policy, [
        'policyDetail.totalSumInsured',
        'benefits.sumInsured',
        'sumInsured',
        'policy.totalSumInsured'
      ]),
      remainingSumInsured: this.getFirstNumber(payload.policy, [
        'policyDetail.remainingSumInsured',
        'benefits.remainingSumInsured',
        'remainingSumInsured'
      ]),
      policyType: this.getFirstString(payload.policy, [
        'policyDetail.type',
        'policyType',
        'planType'
      ]),
      policyActive: this.resolvePolicyActive(payload.policy),
      listedInsuredPersons: this.getFirstStringArray(payload.policy, [
        'member.insuredPersons',
        'policyDetail.insuredPersons'
      ]),
      roomRentCoverage: this.getFirstString(payload.policy, ['policyDetail.metaInfo.roomRentCoverage']),
      waitingPeriodBreakdown:
        this.getFirstObject(payload.policy, ['policyDetail.metaInfo.waitingPeriodBreakdown']) ?? {},
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

  private resolveHospitalizationHours(claim: Record<string, unknown>): number {
    const admission = this.getFirstString(claim, ['dateOfAdmission']);
    const discharge = this.getFirstString(claim, ['dateOfDischarge']);
    if (!admission || !discharge) {
      return 0;
    }

    const fromDate = new Date(admission);
    const toDate = new Date(discharge);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return 0;
    }

    return Math.max((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60), 0);
  }

  private resolveIsDaycare(claim: Record<string, unknown>): boolean {
    const productType = this.getFirstString(claim, ['productType', 'metadata.productType']);
    return /day.?care/i.test(productType);
  }

  private resolvePolicyActive(policy: Record<string, unknown>): boolean {
    const direct = this.getFirstString(policy, ['policyDetail.metaInfo.policyActive']);
    if (direct) {
      return /yes|active|true/i.test(direct);
    }

    const expiryDate = this.getFirstString(policy, ['policyDetail.expiryDate', 'expiryDate']);
    if (!expiryDate) {
      return false;
    }

    const expiry = new Date(expiryDate);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() >= Date.now();
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

  private getFirstBoolean(source: Record<string, unknown>, paths: string[]): boolean {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        return /true|yes|1/i.test(value);
      }
    }
    return false;
  }

  private getFirstObject(source: Record<string, unknown>, paths: string[]): Record<string, unknown> | null {
    for (const path of paths) {
      const value = getValueByPath(source, path);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private findNonPayableItems(items: Array<Record<string, unknown>>): string[] {
    const nonPayableKeywords = [
      'gloves',
      'masks',
      'ppe',
      'registration',
      'admission charges',
      'service charges',
      'attendant',
      'food for relatives',
      'administrative'
    ];

    return items
      .map((item) => String(item.description ?? item.code ?? '').trim())
      .filter((description) =>
        nonPayableKeywords.some((keyword) => description.toLowerCase().includes(keyword))
      );
  }
}
