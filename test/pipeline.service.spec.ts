import { ComparatorService } from '../src/modules/comparator/comparator.service';
import { ConfigService } from '../src/config/config.service';
import { NormalizerService } from '../src/modules/normalizer/normalizer.service';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { PolicyService } from '../src/modules/policy/policy.service';
import { DynamicRuleService } from '../src/modules/rule-engine/dynamic-rule.service';
import { RuleEngineService } from '../src/modules/rule-engine/rule-engine.service';
import { CoverageRule } from '../src/modules/rule-engine/rules/coverage.rule';
import { DuplicateChargeRule } from '../src/modules/rule-engine/rules/duplicate.rule';
import { RoomRentRule } from '../src/modules/rule-engine/rules/room-rent.rule';
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
          tenureMonths: 2
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
    expect(result.summary.failed).toBe(2);
    expect(result.summary.warnings).toBe(1);
    expect(result.normalizedClaim.treatment.name).toBe('FEBRILE SEIZURE');
    expect(result.normalizedClaim.billing.totalAmount).toBe(22531);
    expect(result.normalizedPolicy.policyNumber).toBe('34436826202501');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'waiting_period' }),
        expect.objectContaining({ rule: 'duplicate_charge', status: 'WARNING' }),
        expect.objectContaining({ rule: 'max_total_amount', status: 'FAIL' })
      ])
    );
  });
});
