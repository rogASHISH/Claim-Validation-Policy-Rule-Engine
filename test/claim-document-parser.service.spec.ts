import { ClaimDocumentParserService } from '../src/modules/document/claim-document-parser.service';
import { OcrTextNormalizerService } from '../src/modules/document/ocr-text-normalizer.service';

describe('ClaimDocumentParserService', () => {
  const parser = new ClaimDocumentParserService(new OcrTextNormalizerService());

  it('parses common claim fields from OCR text into structured claim JSON', () => {
    const rawText = `
      Claim No: CFR260208003
      Patient Name: Baby Rupal Tyagi
      Gender: MALE
      DOB: 11/10/2025
      Date of Admission: 08/02/2026
      Date of Discharge: 09/02/2026
      Provisional Diagnosis: FEBRILE SEIZURE
      Estimated Cost: INR 50000
      Room Rent: 3500
      Final Bill Amount: 22531
      Admin Charge 500
      Admin Charge 500
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toEqual(
      expect.objectContaining({
        internalCaseId: 'CFR260208003',
        dateOfAdmission: '2026-02-08T00:00:00.000Z',
        dateOfDischarge: '2026-02-09T00:00:00.000Z',
        patient: expect.objectContaining({
          name: 'Baby Rupal Tyagi',
          gender: 'MALE'
        }),
        treatment: expect.objectContaining({
          name: 'FEBRILE SEIZURE',
          estimatedCost: 50000
        }),
        billing: expect.objectContaining({
          roomRent: 3500,
          totalAmount: 22531
        }),
        billDetail: expect.objectContaining({
          finalBillAmount: 22531
        })
      })
    );

    expect((parsed.billing as { items: unknown[] }).items).toHaveLength(2);
  });

  it('parses flattened hospital bill text like the HCG sample PDF', () => {
    const rawText = `
HCG ONCOLOGY HOSPITAL
Rupees Twenty-Seven Thousand Four Hundred Nine Only
22-Jan-2026   2:25 PM : Discharge Date
22-Jan-2026  10:48 AM : Admission DateBill Amount : 27,409.00
HDFC ergo : Payer Name
Daycare : Billable Bed
INT2112680 : Bill No
GHANSHYAM : Spouse Name's
Female : Gender
59 Yrs : Age
Mrs. RAJNI GHANSHYAM CHIMNANI
Bill No :
INT2112680
Medical Oncology
Accommodation Charges
 2,000.00I
Administrative Charges
 3,588.00II
Medical Package
 6,400.00IV
1 2004 1 2,000.00 2,000.0022-Jan-26 10:48 AM 0 2,000.00ROOM RENT-DCR
CHEMOTHERAPY- MINOR-Dr. Darshana Rane (Medical Oncology)
Total Bill Amount
 27,409.00
Page 1 of 4
Page 2 of 4
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toMatchObject({
      internalCaseId: 'INT2112680',
      productType: 'Daycare',
      patient: {
        name: 'Mrs. RAJNI GHANSHYAM CHIMNANI',
        gender: 'Female',
        age: 59
      },
      treatment: {
        name: 'CHEMOTHERAPY- MINOR-Dr. Darshana Rane (Medical Oncology)'
      },
      billing: {
        roomRent: 2000,
        totalAmount: 27409
      }
    });

    expect((parsed.billing as { items: unknown[] }).items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'Page 1 of', amount: 4 })
      ])
    );
  });

  it('parses OCR text from scanned discharge summary PDFs', () => {
    const rawText = `
HCG
bn HCG os
Discharge Summary
Name of the Patient Rajni Ghanshyam Chimnani
py 59 Years —
Gender Female Date of Registration. 22012026
om MHHAC 0000042740 Date of Admission 22012026
12D number Ac i2i2 Date of Discharge 22012026
Admiting Docior Dr. Dasha Svapel Rane Date of Treatment 22012026
Comamaged Dacor Type of Discharge Planned Discharge
Department of Medical Oncology-Day Care
DIAGNOSIS + CARCINOMA BREAST
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toMatchObject({
      patient: {
        name: 'Rajni Ghanshyam Chimnani',
        gender: 'Female',
        age: 59
      },
      dateOfAdmission: '2026-01-22T00:00:00.000Z',
      dateOfDischarge: '2026-01-22T00:00:00.000Z',
      status: 'Planned Discharge',
      productType: 'Day Care',
      treatment: {
        name: 'CARCINOMA BREAST'
      }
    });
  });

  it('parses OCR text from the Nivok final bill format', () => {
    const rawText = `
NIVOK SUPER SPECIALITY HOSPITAL
Invoice Cum Bill Of Supply (Final)
Bill No. : AIBM2526-001222
Patient Name : B/O. RUPAL TYAGI Bill Date & Time : 09-Feb-2026 02:47 PM
IPD No. : AIPM26-02070013 Doctor Name : Dr. ANKIT KUMAR
Father : TARANG TYAGI Age/Sex £2.29 MONTH(S) / Male
Mobile No. : 8430425010 Adm Date & Time : 07-Feb-2026 10:33 PM
Discharge Type : Normal Dis. Date & Time : 09-Feb-2026 02:45 PM
ROOM CHARGES
7. 07-Feb-2026 PICU 2.00 7,000.00 14,000.00
Total Amount (INR) : 22,530.83
Net Amount (INR) : 22,531.00
    `;

    const parsed = parser.parse(rawText);

    expect(parsed).toMatchObject({
      internalCaseId: 'AIPM26-02070013',
      patient: {
        name: 'B/O. RUPAL TYAGI',
        gender: 'Male',
        age: 0
      },
      dateOfAdmission: expect.stringContaining('2026-02-07T'),
      dateOfDischarge: expect.stringContaining('2026-02-09T'),
      status: 'Normal',
      billing: {
        roomRent: 7000,
        totalAmount: 22531
      },
      billDetail: {
        finalBillAmount: 22531
      }
    });
  });
});
