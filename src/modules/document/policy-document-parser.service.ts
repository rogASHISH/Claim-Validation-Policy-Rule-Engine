import { Injectable } from '@nestjs/common';
import { OcrTextNormalizerService } from './ocr-text-normalizer.service';

@Injectable()
export class PolicyDocumentParserService {
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
    const summaryText = this.extractSummarySection(cleanedText);
    const summaryLines = summaryText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const summaryPairs = this.ocrTextNormalizerService.normalize(summaryText).pairs;

    const policyNumber =
      this.ocrTextNormalizerService.findPairValue(summaryPairs, ['policy no', 'policy number'], {
        includes: true
      }) ||
      this.findTextValue(summaryText, [
        /policy\s*(?:number|no)[\s:.-]*([A-Z0-9-]{5,40})(?:\/[A-Z0-9/-]+)?/i,
        /member\s*policy\s*(?:number|no)[\s:.-]*([A-Z0-9\/.-]{5,40})/i,
        /policy\s*#\s*([A-Z0-9\/.-]{5,40})/i
      ]) ||
      this.findValue(summaryLines, [
        /policy\s*(?:number|no)[\s:.-]*(.+)$/i,
        /member\s*policy\s*(?:number|no)[\s:.-]*(.+)$/i
      ]);

    const roomRentLimit = this.findCurrency(cleanedText, lines, [
      /room\s*rent\s*(?:limit|eligibility|max(?:imum)?)[\s:.-]*([^\n]+)/i,
      /eligible\s*room\s*rent[\s:.-]*([^\n]+)/i,
      /room\s*rent(?:\s*per\s*day)?[\s:.-]*([^\n]+)/i,
      /single\s*private\s*room[\s:.-]*([^\n]+)/i
    ]);
    const totalSumInsured = this.findCurrency(summaryText, summaryLines, [
      /Base Sum Insured(?:INR)?\s*([0-9,]+\.\d{0,2}|[0-9,]+)/i,
      /Sum Insured(?:INR)?\s*([0-9,]+\.\d{0,2}|[0-9,]+)/i
    ]);

    const waitingPeriods = this.findWaitingPeriodDetails(cleanedText, lines);
    const waitingPeriodMonths = waitingPeriods.primaryMonths;
    const coveredTreatments = this.findCoveredTreatments(summaryText, summaryLines);
    const insuredPersons = this.extractInsuredPersons(summaryText);
    const roomRentCoverage =
      this.ocrTextNormalizerService.findPairValue(summaryPairs, ['room rent', 'icu'], {
        includes: true
      }) ||
      this.findTextValue(summaryText, [
        /choose between a ([A-Za-z ]+?Room(?: and a [A-Za-z ]+?Room)?) up to Sum Insured/i,
        /Room Rent\s*([A-Za-z ]{3,120})/i,
        /ICU\s*([A-Za-z ]{3,120})/i
      ]) || '';
    const normalizedRoomRentCoverage =
      /proposal|form|particular|document/i.test(roomRentCoverage) ? '' : roomRentCoverage;

    const policyAgeMonths =
      this.findLooseNumber(
        this.ocrTextNormalizerService.findPairValue(summaryPairs, ['policy age', 'tenure'], {
          includes: true
        })
      ) ||
      this.findTextNumber(summaryText, [
        /policy\s*age\s*(?:in)?\s*months?[\s:.-]*(\d+)/i,
        /tenure\s*(?:in)?\s*months?[\s:.-]*(\d+)/i,
        /member\s*tenure[\s:.-]*(\d+)/i
      ]) || this.findNumber(summaryLines, [
        /policy\s*age\s*(?:in)?\s*months?[\s:.-]*(\d+)/i,
        /tenure\s*(?:in)?\s*months?[\s:.-]*(\d+)/i,
        /member\s*tenure[\s:.-]*(\d+)/i
      ]);

    const inceptionDate = this.findDate(summaryText, summaryLines, [
      /Policy Period\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s*-\s*[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}/i,
      /Policy Commencement Date and Time\s*([0-9/: -]{10,20})/i,
      /Policy Commencement Date and TimeFrom\s*([0-9/: -]{10,20})/i,
      /Policy Period\s*-\s*Start Date(?:00:00 hrs)?\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i,
      /inception\s*date[\s:.-]*(.+)$/i,
      /policy\s*start\s*date[\s:.-]*(.+)$/i,
      /start\s*date[\s:.-]*(.+)$/i,
      /valid\s*from[\s:.-]*(.+)$/i
    ]);

    const expiryDate = this.findDate(summaryText, summaryLines, [
      /Policy Period\s*[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}\s*-\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
      /Policy Expiry Date and Time\s*([0-9/: -]{10,20})/i,
      /Policy Expiry Date and TimeTo\s*([0-9/: -]{10,20})/i,
      /Policy Period\s*-\s*End Date(?:Midnight)?\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i,
      /expiry\s*date[\s:.-]*(.+)$/i,
      /policy\s*end\s*date[\s:.-]*(.+)$/i,
      /end\s*date[\s:.-]*(.+)$/i,
      /valid\s*till[\s:.-]*(.+)$/i,
      /valid\s*to[\s:.-]*(.+)$/i
    ]);

    return {
      policyDetail: {
        policyNumber,
        inceptionDate,
        expiryDate,
        totalSumInsured,
        metaInfo: {
          waitingPeriodMonths,
          roomRentCoverage: normalizedRoomRentCoverage,
          waitingPeriodBreakdown: waitingPeriods
        }
      },
      member: {
        policyNumber,
        tenureMonths: policyAgeMonths,
        insuredPersons
      },
      benefits: {
        roomRent: {
          maxPerDay: roomRentLimit
        },
        coveredTreatments,
        waitingPeriodMonths
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
      const parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1)) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private findTextValue(text: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].replace(/\s+/g, ' ').trim();
      }
    }

    return '';
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

  private findTextNumber(text: string, patterns: RegExp[]): number {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1] && !Number.isNaN(Number(match[1]))) {
        return Number(match[1]);
      }
    }
    return 0;
  }

  private findNumber(lines: string[], patterns: RegExp[]): number {
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1] && !Number.isNaN(Number(match[1]))) {
          return Number(match[1]);
        }
      }
    }
    return 0;
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
        const normalized = this.normalizeDate(match?.[1] ?? '');
        if (normalized) {
          return normalized;
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
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/
    );
    if (slashDateTime) {
      const [, dayRaw, monthRaw, yearRaw, hourRaw = '00', minuteRaw = '00'] = slashDateTime;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const candidate = new Date(
        `${year}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}T${hourRaw.padStart(2, '0')}:${minuteRaw}:00.000Z`
      );

      return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
    }

    const slashDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashDate) {
      const [, dayRaw, monthRaw, yearRaw] = slashDate;
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

    const textualDate = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (textualDate) {
      const [, dayRaw, monthName, yearRaw] = textualDate;
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
        const candidate = new Date(
          `${yearRaw}-${monthRaw}-${dayRaw.padStart(2, '0')}T00:00:00.000Z`
        );
        return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
      }
    }

    const iso = new Date(trimmed);
    return Number.isNaN(iso.getTime()) ? '' : iso.toISOString();
  }

  private findWaitingPeriodDetails(
    text: string,
    lines: string[]
  ): {
    primaryMonths: number;
    initialMonths: number;
    specificDiseaseMonths: number;
    preExistingMonths: number;
    namedAilmentsMonths: number;
    personalMonths: number;
  } {
    const initial =
      this.findTextNumber(text, [
        /Initial\s*Waiting\s*Period\s*(\d+)\s*Days/i,
        /30-day waiting period/i
      ]) ||
      this.findNumber(lines, [/Initial\s*Waiting\s*Period\s*(\d+)\s*Days/i]);
    const initialMonths = initial > 0 ? (initial < 31 ? 1 : Math.ceil(initial / 30)) : 0;

    const preExisting =
      this.findTextNumber(text, [
        /Pre-existing Diseases Coverage\s*\/\s*Initial Wait Period\s*(\d+)\s*Months/i,
        /pre-existing disease(?:s)?[\s\S]{0,220}?expiry of\s*(\d+)\s*months/i
      ]) ||
      this.findNumber(lines, [
        /Pre-existing Diseases Coverage\s*\/\s*Initial Wait Period\s*(\d+)\s*Months/i,
        /pre-existing disease(?:s)?[\s\S]{0,220}?expiry of\s*(\d+)\s*months/i
      ]);

    const namedAilments =
      this.findTextNumber(text, [/Named Ailments Coverage\s*(\d+)\s*Months/i]) ||
      this.findNumber(lines, [/Named Ailments Coverage\s*(\d+)\s*Months/i]);

    const specified =
      this.findTextNumber(text, [/specified disease\/procedure waiting period.*?expiry of\s*(\d+)\s*/i]) ||
      this.findNumber(lines, [/specified disease\/procedure waiting period.*?expiry of\s*(\d+)\s*/i]);

    const personal =
      this.findTextNumber(text, [/personal waiting period.*?up to\s*(\d+)\s*months/i]) ||
      this.findNumber(lines, [/personal waiting period.*?up to\s*(\d+)\s*months/i]);

    const direct =
      this.findTextNumber(text, [
        /waiting\s*period[\s:.-]*(\d+)\s*months?/i,
        /waiting\s*period[\s:.-]*(\d+)/i
      ]) ||
      this.findNumber(lines, [
        /waiting\s*period[\s:.-]*(\d+)\s*months?/i,
        /waiting\s*period[\s:.-]*(\d+)/i
      ]);

    const years =
      this.findTextNumber(text, [/waiting\s*period[\s:.-]*(\d+)\s*years?/i]) ||
      this.findNumber(lines, [/waiting\s*period[\s:.-]*(\d+)\s*years?/i]);
    const yearsMonths = years > 0 ? years * 12 : 0;

    const primaryMonths =
      preExisting ||
      specified ||
      namedAilments ||
      personal ||
      direct ||
      yearsMonths ||
      initialMonths;

    return {
      primaryMonths,
      initialMonths,
      specificDiseaseMonths: specified,
      preExistingMonths: preExisting,
      namedAilmentsMonths: namedAilments,
      personalMonths: personal
    };
  }

  private findCoveredTreatments(text: string, lines: string[]): string[] {
    const collected = new Set<string>();

    const blockPatterns = [/(?:covered\s*treatments?|covered\s*procedures?)[\s:.-]*([^\n]+)/gi];

    blockPatterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        match[1]
          ?.split(/[,;|]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => collected.add(item));
      }
    });

    lines.forEach((line) => {
      const listMatch = line.match(/(?:covered\s*treatments?|covered\s*procedures?)[\s:.-]*(.+)$/i);

      if (listMatch?.[1]) {
        listMatch[1]
          .split(/[,;|]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => {
            if (!/subject to|all categories covered|shared basis|initial wait period|months/i.test(item)) {
              collected.add(item);
            }
          });
      }
    });

    return [...collected];
  }

  private findLooseNumber(value: string): number {
    const match = value.match(/\d{1,4}/);
    return match ? Number(match[0]) : 0;
  }

  private extractSummarySection(text: string): string {
    const starts = [
      text.indexOf('Policy Number'),
      text.indexOf('Policy No'),
      text.indexOf('Insurance Certificate'),
      text.indexOf('Policy Certificate'),
      text.indexOf('Aspire Insurance Certificate'),
      text.indexOf('Premium Certificate')
    ].filter((value) => value >= 0);

    const startIndex = starts.length > 0 ? Math.min(...starts) : 0;
    const endCandidates = [
      text.indexOf('Nominee Details', startIndex),
      text.indexOf('Intermediary Details', startIndex),
      text.indexOf('Product Benefits', startIndex),
      text.indexOf('Premium Acknowledgement', startIndex),
      text.indexOf('OptionalBenefit/FeatureDetails', startIndex),
      text.indexOf('Optional Benefit/Feature Details', startIndex),
      text.indexOf('Terms and Conditions', startIndex)
    ].filter((value) => value > startIndex);

    const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(text.length, startIndex + 4000);

    return text.slice(startIndex, endIndex);
  }

  private extractInsuredPersons(text: string): string[] {
    const names = new Set<string>();
    const patterns = [
      /Policyholder Name:\s*([A-Za-z .]+)\n/i,
      /(?:Mr|Ms|Mrs)\.?\s+[A-Za-z][A-Za-z ]{2,40}(?=\d)/g
    ];

    const directPolicyholder = text.match(patterns[0]);
    if (directPolicyholder?.[1]) {
      names.add(directPolicyholder[1].replace(/\s+/g, ' ').trim());
    }

    for (const match of text.matchAll(patterns[1])) {
      const name = match[0].replace(/\s+/g, ' ').trim();
      if (name) {
        names.add(name);
      }
    }

    const insuredBlock = text.match(/InsuredDetails([\s\S]{0,2000})CoverDetails/i);
    if (insuredBlock?.[1]) {
    for (const match of insuredBlock[1].matchAll(/[A-Z][A-Za-z ]{2,40}(?=\d{1,2}\/\d{1,2}\/\d{4})/g)) {
        const name = match[0]
          .replace(/\b(Male|Female|Self|Spouse|Daughter|Son)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (name) {
          names.add(name);
        }
      }
    }

    return [...names];
  }
}
