import { Injectable } from '@nestjs/common';
import { OcrTextNormalizerService } from './ocr-text-normalizer.service';

@Injectable()
export class ClaimDocumentParserService {
  constructor(private readonly ocrTextNormalizerService: OcrTextNormalizerService) {}

  parse(rawText: string): Record<string, unknown> {
    const embeddedJson = this.tryParseEmbeddedJson(rawText);
    if (embeddedJson) {
      return embeddedJson;
    }

    const normalized = this.ocrTextNormalizerService.normalize(rawText);
    const cleanedText = normalized.text;
    const lines = normalized.lines;
    const pairs = normalized.pairs;

    const patientName = this.sanitizePersonName(
      this.findTextValue(cleanedText, [
        /Patient Name\s*:?\s*([\s\S]{1,80}?)(?:Bill Date|IPD No|Father|Age\/Sex|Mobile No|Adm Date|$)/i,
        /Name of (?:the )?Patient\s+([A-Za-z .'-]{3,80})/i,
        /(?:^|\n)Name:\s*([\s\S]{1,80}?)\s*Bill No/i,
        /Name\s*:?\s*([\s\S]{1,80}?)\s*UHID/i,
        /(?:Male|Female|Other)\s*:?\s*Gender[\s\S]{0,40}?[0-9]{1,3}\s*Yrs\s*:?\s*Age\s*([\s\S]{3,80}?)\s*Bill No/i
      ]) ||
        this.ocrTextNormalizerService.findPairValue(pairs, ['patient name', 'member name'], {
          includes: true
        }) ||
        this.findValue(lines, [/patient\s*name[:\-]?\s*(.+)$/i, /member\s*name[:\-]?\s*(.+)$/i])
    );
    const gender =
      this.findTextValue(cleanedText, [
        /Age\/Sex\s*[:£]?\s*[^/\n]+\/\s*(Male|Female|Other)/i,
        /Gender\s+(Male|Female|Other)/i,
        /Gender\s*:?\s*(Male|Female|Other)/i,
        /(Male|Female|Other)\s*:?\s*Gender/i
      ]) ||
      this.ocrTextNormalizerService.findPairValue(pairs, ['gender']) ||
      this.findValue(lines, [/gender[:\-]?\s*(male|female|other)$/i, /sex[:\-]?\s*(male|female|other)$/i]);
    const dob = this.findDate(cleanedText, lines, [
      /DOB\s*:?\s*(.+)$/i,
      /date\s*of\s*birth[:\-]?\s*(.+)$/i
    ]);
    const age =
      this.findAgeFromAgeSex(this.ocrTextNormalizerService.findPairValue(pairs, ['age/sex'], {
        includes: true
      })) ||
      this.findAgeFromAgeSex(
        this.findTextValue(cleanedText, [/Age\/Sex\s*[:£]?\s*([^\n]+)/i])
      ) ||
      this.findLooseNumber(this.ocrTextNormalizerService.findPairValue(pairs, ['age'])) ||
      this.findTextNumber(cleanedText, [
        /(\d{1,3})\s*Years\b/i,
        /(\d{1,3})\s*(?:Yrs|Years)\s*:?\s*Age/i,
        /Age\s*:?\s*(\d{1,3})\s*(?:Yrs|Years)?/i
      ]) ||
      this.findNumber(lines, [/age[:\-]?\s*(\d{1,3})/i]);
    const diagnosis =
      this.findTextValue(cleanedText, [
        /DIAGNOSIS\s*[+:]?\s*([A-Z0-9 ,()/-]{3,120})/i,
        /PROCEDURE DONE\s*:?\s*([\s\S]{1,120}?)(?:Anesthesia|OPERATIVE FINDINGS|COURSE IN HOSPITAL|$)/i,
        /Surgery Event\s*-\s*([A-Za-z0-9 ,()/-]{3,120})/i,
        /Department of ([A-Za-z -]{3,120})/i,
        /Provisional\s*Diagnosis\s*:?\s*([\s\S]{1,120}?)(?:Estimated Cost|Room Rent|Bill Amount|Final Bill Amount|$)/i,
        /(CHEMOTHERAPY[\s\S]{0,80}?\(Medical Oncology\))/i,
        /Medical Oncology/i
      ]) ||
      this.findValue(lines, [
      /diagnosis[:\-]?\s*(.+)$/i,
      /provisional\s*diagnosis[:\-]?\s*(.+)$/i,
      /chief\s*complaint[:\-]?\s*(.+)$/i,
      /treatment[:\-]?\s*(.+)$/i
      ]);
    const estimatedCost = this.findCurrency(cleanedText, lines, [
      /estimated\s*cost[:\-]?\s*([^\n]+)/i,
      /estimated\s*amount[:\-]?\s*([^\n]+)/i
    ]);
    const roomRent = this.findCurrency(cleanedText, lines, [
      /ROOM CHARGES[\s\S]{0,200}?(?:PICU|NICU|ROOM|WARD|DELUXE|SEMI[- ]?PRIVATE|PRIVATE)[^\n]*?\s+\d+(?:\.\d+)?\s+([0-9,]+\.\d{2})\s+[0-9,]+\.\d{2}/i,
      /Room Charges[\s\S]{0,120}?([0-9,]+\.\d{2})/i,
      /PICU\s+\d+\.\d+\s+([0-9,]+\.\d{2})/i,
      /(\d[\d,]*\.\d{2})\s*ROOM RENT/i,
      /Accommodation Charges[\s\S]{0,80}?Dept Total\s*:\s*([0-9,]+\.\d{2})/i,
      /room\s*rent[:\-]?\s*([^\n]+)/i,
      /room\s*charges?[:\-]?\s*([^\n]+)/i
    ]);
    const totalAmount = this.findCurrency(cleanedText, lines, [
      /Final Amount\s*:?\s*₹?\s*([0-9,]+\.\d{2})/i,
      /Net Amount \(INR\)\s*:?\s*([0-9,]+\.\d{2})/i,
      /Total Amount \(INR\)\s*:?\s*([0-9,]+\.\d{2})/i,
      /Bill Amount\s*:?\s*`?\s*([0-9,]+\.\d{2})/i,
      /Total Bill Amount\s*([0-9,]+\.\d{2})/i,
      /To Pay\s*([0-9,]+\.\d{2})/i,
      /final\s*bill\s*amount[:\-]?\s*([^\n]+)/i,
      /total\s*amount[:\-]?\s*([^\n]+)/i,
      /total\s*bill[:\-]?\s*([^\n]+)/i,
      /claim\s*amount[:\-]?\s*([^\n]+)/i
    ]);
    const caseId =
      this.ocrTextNormalizerService.findPairValue(pairs, ['ipd no'], { includes: true }) ||
      this.ocrTextNormalizerService.findPairValue(pairs, ['bill no', 'claim no'], {
        includes: true
      }) ||
      this.findTextValue(cleanedText, [
        /IPD No\.?\s*:?\s*([A-Z0-9-]+)/i,
        /Bill No\.?\s*:?\s*([A-Z0-9-]+)/i,
        /\b(MHHAC[. ]?\d{4,})\b/i,
        /\b(?:UHID|IP)\b\s*(?:number|no\.?)?\s*([A-Z0-9. ]{4,40})/i,
        /(?:^|\n)\s*([A-Z0-9.-]{4,})\s*:\s*Bill No\b/i,
        /Bill No\s*:?\s*([A-Z0-9.-]+)/i,
        /Claim No\s*:?\s*([A-Z0-9.-]+)/i,
        /(?:^|\n)\s*([A-Z0-9.-]{4,})\s*:\s*Claim No\b/i,
        /Internal Case Id\s*:?\s*([A-Z0-9.-]+)/i
      ]) ||
      this.ocrTextNormalizerService.findPairValue(pairs, [
        'ip number',
        'ip no',
        'case id',
        'internal case id',
        'uhid'
      ], { includes: true }) ||
      this.findValue(lines, [
      /case\s*id[:\-]?\s*(.+)$/i,
      /claim\s*(?:ref(?:erence)?|number|no)[.: -]?\s*(.+)$/i,
      /internal\s*case\s*id[:\-]?\s*(.+)$/i
      ]);
    const admissionDate = this.findDate(cleanedText, lines, [
      /Adm Date & Time\s*:?\s*(.+)$/i,
      /DATE\s*OF\s*ADMISSION[:\s-]*([0-9-]{8,12})/i,
      /Date of Admission\s+([0-9]{8})/i,
      /(\d{1,2}-[A-Za-z]{3}-\d{2,4}(?:\s+\d{1,2}:\d{2}\s*[AP]M)?)\s*:?\s*Admission Date/i,
      /date\s*of\s*admission[:\-]?\s*(.+)$/i,
      /admission\s*date[:\-]?\s*(.+)$/i
    ]);
    const dischargeDate = this.findDate(cleanedText, lines, [
      /Dis\. Date & Time\s*:?\s*(.+)$/i,
      /DATE\s*OF\s*DISCHARGE[:\s-]*([0-9-]{8,12})/i,
      /Date of Discharge\s+([0-9]{8})/i,
      /(\d{1,2}-[A-Za-z]{3}-\d{2,4}(?:\s+\d{1,2}:\d{2}\s*[AP]M)?)\s*:?\s*Discharge Date/i,
      /date\s*of\s*discharge[:\-]?\s*(.+)$/i,
      /discharge\s*date[:\-]?\s*(.+)$/i
    ]);
    const status = this.sanitizeStatus(
      this.ocrTextNormalizerService.findPairValue(pairs, ['status', 'type of discharge'], {
        includes: true
      }) ||
        this.findTextValue(cleanedText, [
          /Discharge Type\s*:?\s*([A-Za-z ]{3,60})/i,
          /Type of Discharge\s+([A-Za-z ]{3,60})/i,
          /Interim BillFinal/i,
          /Final Bill/i,
          /Interim Bill/i
        ]) ||
        this.findValue(lines, [/status[:\-]?\s*(.+)$/i])
    );
    const productType =
      this.ocrTextNormalizerService.findPairValue(pairs, ['department', 'product type'], {
        includes: true
      }) ||
      this.findTextValue(cleanedText, [
        /Day\s*Care/i,
        /Department of ([A-Za-z -]{3,120})/i,
        /Daycare/i,
        /In Patient Services/i
      ]) ||
      this.findValue(lines, [/product\s*type[:\-]?\s*(.+)$/i]);
    const deductions = this.extractDeductions(lines, cleanedText);

    return {
      internalCaseId: this.sanitizeCaseId(caseId),
      productType,
      dateOfAdmission: admissionDate,
      dateOfDischarge: dischargeDate,
      status,
      patient: {
        name: patientName,
        gender,
        dob,
        age
      },
      treatment: {
        name: diagnosis,
        estimatedCost,
        metaInfo: {
          provisionalDiagnosis: diagnosis
        }
      },
      billing: {
        roomRent,
        totalAmount,
        items: deductions
      },
      billDetail: {
        finalBillAmount: totalAmount
      },
      claimDetail: {
        deductions
      }
    };
  }

  private tryParseEmbeddedJson(rawText: string): Record<string, unknown> | null {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      const maybeJson = rawText.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(maybeJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private findValue(lines: string[], patterns: RegExp[]): string {
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]?.trim()) {
          return match[1].trim();
        }
      }
    }
    return '';
  }

  private findTextValue(text: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]?.trim()) {
      const normalized = match[1]
          .replace(/\s+/g, ' ')
          .replace(/(UHID|Bill No|IP No)\s*:?.*$/i, '')
          .trim();
        if (
          normalized &&
          normalized !== "'s" &&
          !/spouse name'?s?/i.test(normalized) &&
          normalized.length > 2
        ) {
          return normalized;
        }
      }

      if (!pattern.source.includes('(') && match?.[0]) {
        const normalized = match[0].replace(/\s+/g, ' ').trim();
        if (normalized) {
          return normalized;
        }
      }
    }
    return '';
  }

  private findNumber(lines: string[], patterns: RegExp[]): number {
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) {
          return Number(match[1]);
        }
      }
    }
    return 0;
  }

  private findTextNumber(text: string, patterns: RegExp[]): number {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1] && !Number.isNaN(Number(match[1]))) {
        return Number(match[1]);
      }
    }
    return 0;
  }

  private findLooseNumber(value: string): number {
    const match = value.match(/\d{1,4}/);
    return match ? Number(match[0]) : 0;
  }

  private findAgeFromAgeSex(value: string): number {
    const match = value.match(/(\d{1,3}(?:\.\d+)?)\s*(?:month|months|yr|yrs|year|years)/i);
    if (!match) {
      return 0;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return 0;
    }

    if (/month/i.test(match[0])) {
      return Math.floor(amount / 12);
    }

    return Math.floor(amount);
  }

  private findCurrency(text: string, lines: string[], patterns: RegExp[]): number {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const numeric = match[1].replace(/[^\d.]/g, '');
        if (numeric && !Number.isNaN(Number(numeric))) {
          return Number(numeric);
        }
      }
    }

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) {
          const numeric = match[1].replace(/[^\d.]/g, '');
          if (numeric && !Number.isNaN(Number(numeric))) {
            return Number(numeric);
          }
        }
      }
    }
    return 0;
  }

  private findDate(text: string, lines: string[], patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const textMatch = text.match(pattern);
      const textParsed = this.normalizeDate(textMatch?.[1] ?? '');
      if (textParsed) {
        return textParsed;
      }
    }

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        const parsed = this.normalizeDate(match?.[1] ?? '');
        if (parsed) {
          return parsed;
        }
      }
    }
    return '';
  }

  private normalizeDate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const slashDateTime = trimmed.match(
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?$/
    );
    if (slashDateTime) {
      const [, dayRaw, monthRaw, yearRaw, hourRaw = '00', minuteRaw = '00', meridiem] =
        slashDateTime;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const hour = this.normalizeHour(hourRaw, meridiem);
      const timeSuffix = meridiem || slashDateTime[4] ? `${hour}:${minuteRaw}:00.000Z` : '00:00:00.000Z';
      const candidate = new Date(
        `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}T${timeSuffix}`
      );

      return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
    }

    const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
      const [, dayRaw, monthRaw, yearRaw] = match;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const candidate = new Date(
        `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}T00:00:00.000Z`
      );

      return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
    }

    const compactDate = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compactDate) {
      const [, dayRaw, monthRaw, yearRaw] = compactDate;
      const candidate = new Date(`${yearRaw}-${monthRaw}-${dayRaw}T00:00:00.000Z`);
      return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
    }

    const textualDateTime = trimmed.match(
      /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?$/
    );
    if (textualDateTime) {
      const [, dayRaw, monthName, yearRaw, hourRaw = '00', minuteRaw = '00', meridiem] =
        textualDateTime;
      const monthMap: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12'
      };
      const monthRaw = monthMap[monthName.toLowerCase()];
      if (monthRaw) {
        const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
        const hour = this.normalizeHour(hourRaw, meridiem);
        const timeSuffix = meridiem || textualDateTime[4] ? `${hour}:${minuteRaw}:00.000Z` : '00:00:00.000Z';
        const candidate = new Date(
          `${year}-${monthRaw}-${dayRaw.padStart(2, '0')}T${timeSuffix}`
        );
        return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
      }
    }

    const dashedNumericDate = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dashedNumericDate) {
      const [, dayRaw, monthRaw, yearRaw] = dashedNumericDate;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const candidate = new Date(
        `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}T00:00:00.000Z`
      );
      return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
    }

    const iso = new Date(trimmed);
    return Number.isNaN(iso.getTime()) ? '' : iso.toISOString();
  }

  private normalizeHour(hourRaw: string, meridiem?: string): string {
    const parsedHour = Number(hourRaw);
    if (!Number.isFinite(parsedHour)) {
      return '00';
    }

    if (!meridiem) {
      return String(parsedHour).padStart(2, '0');
    }

    const normalizedMeridiem = meridiem.toUpperCase();
    if (normalizedMeridiem === 'AM') {
      return String(parsedHour === 12 ? 0 : parsedHour).padStart(2, '0');
    }

    return String(parsedHour === 12 ? 12 : parsedHour + 12).padStart(2, '0');
  }

  private sanitizePersonName(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\b(Bill Date|IPD No|Father|Age\/Sex|Mobile No|Adm Date).*/i, '')
      .trim();
  }

  private sanitizeCaseId(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\b(Doctor Name|Bill Date|Patient Name).*/i, '')
      .trim();
  }

  private sanitizeStatus(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\bDis\.?$/i, '')
      .trim();
  }

  private extractDeductions(
    lines: string[],
    rawText: string
  ): Array<Record<string, unknown>> {
    if (!/(Amount\(INR\)|Dept Total|Bill Amount|Final Bill Amount)/i.test(rawText)) {
      return [];
    }

    const ignoredLabels = [
      'patient',
      'name',
      'diagnosis',
      'date',
      'status',
      'room rent',
      'final bill',
      'total amount',
      'estimated',
      'page ',
      'generated by',
      'cashier',
      'to pay',
      'outstanding amount'
    ];

    const detailLineItems = this.extractDetailedLineItems(rawText);
    if (detailLineItems.length > 0) {
      return detailLineItems;
    }

    return lines
      .map((line): { description: string; amount: number } | null => {
        const match = line.match(/^([A-Za-z][A-Za-z0-9 /&().-]{2,})\s+(\d+(?:,\d{3})*(?:\.\d{1,2})?)$/);
        if (!match) {
          return null;
        }

        const description = match[1].trim();
        const normalized = description.toLowerCase();
        if (ignoredLabels.some((label) => normalized.includes(label))) {
          return null;
        }

        return {
          description,
          amount: Number(match[2].replace(/,/g, ''))
        };
      })
      .filter((item): item is { description: string; amount: number } => item !== null)
      .map((item) => item as Record<string, unknown>);
  }

  private extractDetailedLineItems(rawText: string): Array<Record<string, unknown>> {
    const items: Array<Record<string, unknown>> = [];
    const pattern =
      /(\d[\d,]*\.\d{2})\s*([A-Z][A-Z0-9 ()/%&.+,\-]{3,}?)(?=(?:\s+\d+\s+\d[\d,]*\.\d{2})|Dept Total|Page|\n\n|$)/g;

    for (const match of rawText.matchAll(pattern)) {
      const amount = Number(match[1].replace(/,/g, ''));
      const description = match[2].replace(/\s+/g, ' ').trim();

      if (
        !description ||
        /^(Page|Dept Total|Generated By|Name|Bill No|IP No)$/i.test(description) ||
        Number.isNaN(amount)
      ) {
        continue;
      }

      items.push({ description, amount });
    }

    return items.slice(0, 25);
  }
}
