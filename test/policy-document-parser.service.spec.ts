import { PolicyDocumentParserService } from '../src/modules/document/policy-document-parser.service';
import { OcrTextNormalizerService } from '../src/modules/document/ocr-text-normalizer.service';

describe('PolicyDocumentParserService', () => {
  const parser = new PolicyDocumentParserService(new OcrTextNormalizerService());

  it('parses common policy fields from OCR text into structured policy JSON', () => {
    const rawText = `
      Policy Number: 34436826202501
      Inception Date: 30/12/2025
      Expiry Date: 29/12/2026
      Room Rent Limit: INR 3000
      Waiting Period: 24 months
      Covered Treatments: FEBRILE SEIZURE, X-Ray, MRI
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toEqual(
      expect.objectContaining({
        member: expect.objectContaining({
          policyNumber: '34436826202501'
        }),
        benefits: expect.objectContaining({
          roomRent: expect.objectContaining({
            maxPerDay: 3000
          }),
          waitingPeriodMonths: 24,
          coveredTreatments: ['FEBRILE SEIZURE', 'X-Ray', 'MRI']
        }),
        policyDetail: expect.objectContaining({
          policyNumber: '34436826202501',
          inceptionDate: '2025-12-30T00:00:00.000Z',
          expiryDate: '2026-12-29T00:00:00.000Z'
        })
      })
    );
  });

  it('parses OCR-style scanned policy text into structured policy JSON', () => {
    const rawText = `
      Health Insurance Policy
      Policy Number 34436826202501
      Valid From 30122025
      Valid Till 29122026
      Room Rent Eligibility 3000
      Waiting Period 24 months
      Covered Treatments Chemotherapy, Carcinoma Breast, X-Ray
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toEqual(
      expect.objectContaining({
        member: expect.objectContaining({
          policyNumber: '34436826202501'
        }),
        benefits: expect.objectContaining({
          roomRent: expect.objectContaining({
            maxPerDay: 3000
          }),
          waitingPeriodMonths: 24,
          coveredTreatments: ['Chemotherapy', 'Carcinoma Breast', 'X-Ray']
        }),
        policyDetail: expect.objectContaining({
          policyNumber: '34436826202501',
          inceptionDate: '2025-12-30T00:00:00.000Z',
          expiryDate: '2026-12-29T00:00:00.000Z'
        })
      })
    );
  });

  it('parses Care Health policy certificate text correctly', () => {
    const rawText = `
Policy Certificate
Policy No.89736977
Plan NameCare Supreme
Cover TypeFloater
Policy Period - Start Date00:00 hrs 19-Sep-2025
Policy Period - End DateMidnight 18-Sep-2026
Schedule of Benefits
16Room RentAll categories covered.
17ICUNo Limit
18Named Ailments Coverage24 Months
19Pre-existing Diseases Coverage  / Initial Wait Period36 Months   / 30 Days
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toEqual(
      expect.objectContaining({
        member: expect.objectContaining({
          policyNumber: '89736977'
        }),
        benefits: expect.objectContaining({
          roomRent: expect.objectContaining({
            maxPerDay: 0
          }),
          waitingPeriodMonths: 36,
          coveredTreatments: []
        }),
        policyDetail: expect.objectContaining({
          policyNumber: '89736977',
          inceptionDate: '2025-09-19T00:00:00.000Z',
          expiryDate: '2026-09-18T00:00:00.000Z',
          metaInfo: expect.objectContaining({
            roomRentCoverage: 'All categories covered'
          })
        })
      })
    );
  });

  it('parses Niva Bupa policy certificate summary generically', () => {
    const rawText = `
Product Name: Aspire, Product UIN: NBHHLIP24129V012324
Aspire Insurance Certificate
Policyholder Name: MR. TARANG TYAGI
Policy Number34436826202501
Policy Commencement Date and TimeFrom 14/11/2025 00:00
Policy Expiry Date and TimeTo 13/11/2026 23:59
Optional Benefit/Feature Details
Room Type ModificationNot Opted
Product Benefit Table
You can choose between a Standard Single Room and a Shared Room up to Sum Insured.
M-iracle
Waiting Period of 9 Months Applicable.
Pre-existing disease (Code- Excl01) excluded until the expiry of 36 months of continuous coverage.
Personal Waiting Period up to 48 months may apply.
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toMatchObject({
      member: {
        policyNumber: '34436826202501'
      },
      benefits: {
        roomRent: {
          maxPerDay: 0
        },
        waitingPeriodMonths: 36,
        coveredTreatments: []
      },
      policyDetail: {
        policyNumber: '34436826202501',
        inceptionDate: '2025-11-14T00:00:00.000Z',
        expiryDate: '2026-11-13T23:59:00.000Z',
        metaInfo: {
          waitingPeriodBreakdown: expect.objectContaining({
            primaryMonths: 36,
            preExistingMonths: 36,
            personalMonths: 48
          })
        }
      }
    });
  });
});
