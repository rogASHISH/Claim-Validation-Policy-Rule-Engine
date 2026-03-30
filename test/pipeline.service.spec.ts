import { ComparatorService } from '../src/modules/comparator/comparator.service';
import { ConfigService } from '../src/config/config.service';
import { NormalizerService } from '../src/modules/normalizer/normalizer.service';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { PolicyService } from '../src/modules/policy/policy.service';
import { DynamicRuleService } from '../src/modules/rule-engine/dynamic-rule.service';
import { RuleEngineService } from '../src/modules/rule-engine/rule-engine.service';
import { BillingComplianceRule } from '../src/modules/rule-engine/rules/billing-compliance.rule';
import { CoverageRule } from '../src/modules/rule-engine/rules/coverage.rule';
import { DocumentCompletenessRule } from '../src/modules/rule-engine/rules/document-completeness.rule';
import { DuplicateChargeRule } from '../src/modules/rule-engine/rules/duplicate.rule';
import { HospitalizationRule } from '../src/modules/rule-engine/rules/hospitalization.rule';
import { InsuredMemberRule } from '../src/modules/rule-engine/rules/insured-member.rule';
import { PolicyValidityRule } from '../src/modules/rule-engine/rules/policy-validity.rule';
import { RoomRentRule } from '../src/modules/rule-engine/rules/room-rent.rule';
import { SumInsuredRule } from '../src/modules/rule-engine/rules/sum-insured.rule';
import { WaitingPeriodRule } from '../src/modules/rule-engine/rules/waiting-period.rule';

describe('PipelineService', () => {
  const pipelineService = new PipelineService(
    new PolicyService(new ConfigService()),
    new NormalizerService(),
    new RuleEngineService(
      new RoomRentRule(),
      new CoverageRule(),
      new WaitingPeriodRule(),
      new DuplicateChargeRule(),
      new PolicyValidityRule(),
      new InsuredMemberRule(),
      new SumInsuredRule(),
      new HospitalizationRule(),
      new DocumentCompletenessRule(),
      new BillingComplianceRule(),
      new DynamicRuleService()
    ),
    new ComparatorService()
  );

  it('normalizes portal-style payloads and detects rejection risk', () => {
    const result = pipelineService.validateClaim({
      claim: {
        id: '889a6c6a-8334-4233-99d7-9fa019516510',
        internalCaseId: 'CFR260208003',
        productType: 'REIMBURSEMENT',
        dateOfAdmission: '2026-02-08T00:00:00.000Z',
        dateOfDischarge: '2026-02-09T00:00:00.000Z',
        status: 'SETTLEMENT_DONE',
        finalApprovedAmt: 20000,
        sourceDocuments: {
          filenames: ['final-bill.pdf', 'discharge-summary.pdf'],
          hasDischargeSummary: true,
          hasFinalBill: true,
          hasItemizedBill: false,
          hasClaimForm: false,
          hasPrescription: false,
          hasInvestigationReport: false
        },
        treatment: {
          estimatedCost: 50000,
          metaInfo: {
            chiefComplaint: 'fever',
            doctorPrescription: 'febrile seizure',
            provisionalDiagnosis: 'FEBRILE SEIZURE'
          }
        },
        patient: {
          id: 'f1ecff02-1d65-45d4-9c28-c85a7ea60d8d',
          firstName: 'BABY RUPAL TYAGI',
          lastName: 'TYAGI',
          gender: 'MALE',
          dob: '2025-10-11T00:00:00.000Z'
        },
        billDetail: {
          finalBillAmount: 22531,
          partnerApprovedAmount: 22531
        },
        claimDetail: {
          settlementAmount: 20000,
          deductions: [
            { code: 'DED-001', description: 'Admin charge', amount: 500 },
            { code: 'DED-001', description: 'Admin charge', amount: 500 }
          ]
        }
      },
      policy: {
        member: {
          policyNumber: '34436826202501',
          tenureMonths: 2,
          insuredPersons: ['BABY RUPAL TYAGI TYAGI']
        },
        policyDetail: {
          inceptionDate: '2025-12-30T00:00:00.000Z',
          expiryDate: '2026-12-29T00:00:00.000Z',
          totalSumInsured: 100000,
          remainingSumInsured: 15000
        },
        benefits: {
          roomRent: {
            maxPerDay: 3000
          },
          coveredTreatments: ['FEBRILE SEIZURE', 'X-Ray'],
          waitingPeriodMonths: 24
        },
        customRules: [
          {
            code: 'max_total_amount',
            field: 'billing.totalAmount',
            operator: 'lte',
            expectedValue: 20000,
            failureStatus: 'FAIL',
            impact: 'possible rejection',
            message: 'Total billed amount exceeds the allowed claim amount.'
          }
        ]
      }
    });

    expect(result.status).toBe('REJECTION_RISK');
    expect(result.summary.failed).toBeGreaterThanOrEqual(3);
    expect(result.summary.warnings).toBeGreaterThanOrEqual(2);
    expect(result.normalizedClaim.treatment.name).toBe('FEBRILE SEIZURE');
    expect(result.normalizedClaim.billing.totalAmount).toBe(22531);
    expect(result.normalizedPolicy.policyNumber).toBe('34436826202501');
    expect(result.ruleEngineContext.claim.documents.hasDischargeSummary).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'sum_insured_available' }),
        expect.objectContaining({ rule: 'waiting_period' }),
        expect.objectContaining({ rule: 'document_completeness', status: 'WARNING' }),
        expect.objectContaining({ rule: 'duplicate_charge', status: 'WARNING' }),
        expect.objectContaining({ rule: 'max_total_amount', status: 'FAIL' })
      ])
    );
  });
});
