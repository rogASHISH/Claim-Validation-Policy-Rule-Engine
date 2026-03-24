export const samplePayload = {
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
      billNumber: 'AIBM2526-001222',
      finalBillAmount: 22531,
      partnerApprovedAmount: 22531
    },
    claimDetail: {
      status: 'APPROVED',
      settlementAmount: 20000,
      deductions: [
        {
          code: 'DED-001',
          description: 'Admin charge',
          amount: 500
        },
        {
          code: 'DED-001',
          description: 'Admin charge',
          amount: 500
        }
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
      },
      {
        code: 'adult_patient_only',
        field: 'patient.age',
        operator: 'gte',
        expectedValue: 18,
        failureStatus: 'WARNING',
        impact: 'review',
        message: 'Patient age should be verified against an adult-only policy.'
      }
    ]
  }
};
