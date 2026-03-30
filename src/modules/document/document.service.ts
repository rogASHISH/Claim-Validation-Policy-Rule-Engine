import { BadRequestException, Injectable } from '@nestjs/common';
import { PipelineService } from '../pipeline/pipeline.service';
import { DocumentOcrService } from './document-ocr.service';
import { ClaimDocumentParserService } from './claim-document-parser.service';
import {
  NormalizedOcrDocument,
  OcrTextNormalizerService
} from './ocr-text-normalizer.service';
import { PolicyDocumentParserService } from './policy-document-parser.service';

type ParsedDocumentResult = {
  rawParsedDocument?: Record<string, unknown>;
  parsedDocument: Record<string, unknown>;
  ingestion?: {
    sourceType: string;
    extractor?: string;
    pageCount?: number;
    rawText?: string;
    merged?: boolean;
    mergedFileCount?: number;
    mergedFilenames?: string[];
  };
};

type ClaimDocumentBuckets = {
  claimDocument?: Express.Multer.File[];
  claimDischargeSummary?: Express.Multer.File[];
  claimFinalBill?: Express.Multer.File[];
  claimItemizedBill?: Express.Multer.File[];
  claimClaimForm?: Express.Multer.File[];
  claimPrescription?: Express.Multer.File[];
  claimInvestigationReport?: Express.Multer.File[];
};

type PolicyDocumentBuckets = {
  policyDocument?: Express.Multer.File[];
  policyCertificate?: Express.Multer.File[];
  policySchedule?: Express.Multer.File[];
  policyWording?: Express.Multer.File[];
};

@Injectable()
export class DocumentService {
  constructor(
    private readonly pipelineService: PipelineService,
    private readonly documentOcrService: DocumentOcrService,
    private readonly ocrTextNormalizerService: OcrTextNormalizerService,
    private readonly claimDocumentParserService: ClaimDocumentParserService,
    private readonly policyDocumentParserService: PolicyDocumentParserService
  ) {}

  async parseClaimPdf(files: Express.Multer.File[] | undefined, includeRawText = false) {
    const normalizedFiles = this.requireFiles(files, 'claimDocument');
    const extraction = await this.documentOcrService.extractMany(normalizedFiles);
    const rawParsedClaim = this.buildRawParsedDocument('claim', extraction.rawText);
    const parsedClaim = this.enrichParsedDocument(
      this.claimDocumentParserService.parse(extraction.rawText),
      'claim',
      normalizedFiles.map((file) => file.originalname)
    );

    return {
      rawParsedDocument: rawParsedClaim,
      parsedDocument: parsedClaim,
      ingestion: {
        sourceType: 'claim-pdf',
        extractor: extraction.provider,
        pageCount: extraction.pageCount,
        rawText: includeRawText ? extraction.rawText : undefined,
        merged: normalizedFiles.length > 1,
        mergedFileCount: normalizedFiles.length,
        mergedFilenames: normalizedFiles.map((file) => file.originalname)
      }
    };
  }

  async parsePolicyPdf(files: Express.Multer.File[] | undefined, includeRawText = false) {
    const normalizedFiles = this.requireFiles(files, 'policyDocument');
    const extraction = await this.documentOcrService.extractMany(normalizedFiles);
    const rawParsedPolicy = this.buildRawParsedDocument('policy', extraction.rawText);
    const parsedPolicy = this.enrichParsedDocument(
      this.policyDocumentParserService.parse(extraction.rawText),
      'policy',
      normalizedFiles.map((file) => file.originalname)
    );

    return {
      rawParsedDocument: rawParsedPolicy,
      parsedDocument: parsedPolicy,
      ingestion: {
        sourceType: 'policy-pdf',
        extractor: extraction.provider,
        pageCount: extraction.pageCount,
        rawText: includeRawText ? extraction.rawText : undefined,
        merged: normalizedFiles.length > 1,
        mergedFileCount: normalizedFiles.length,
        mergedFilenames: normalizedFiles.map((file) => file.originalname)
      }
    };
  }

  async validateMixedInputs(params: {
    claimDocuments?: ClaimDocumentBuckets;
    policyDocuments?: PolicyDocumentBuckets;
    claimJson?: string;
    policyJson?: string;
    includeRawText?: boolean;
  }) {
    const claimFiles = this.collectClaimFiles(params.claimDocuments);
    const policyFiles = this.collectPolicyFiles(params.policyDocuments);

    const claimResult: ParsedDocumentResult = claimFiles.length
      ? await this.parseTypedClaimDocuments(params.claimDocuments ?? {}, params.includeRawText)
      : { parsedDocument: this.parseJsonField(params.claimJson, 'claimJson') };

    const policyResult: ParsedDocumentResult = policyFiles.length
      ? await this.parseTypedPolicyDocuments(params.policyDocuments ?? {}, params.includeRawText)
      : { parsedDocument: this.parseJsonField(params.policyJson, 'policyJson') };

    const validationResult = this.pipelineService.validateClaim({
      claim: claimResult.parsedDocument,
      policy: policyResult.parsedDocument
    });

    return {
      ...validationResult,
      ingestion: {
        claimSource: claimFiles.length ? 'pdf' : 'json',
        policySource: policyFiles.length ? 'pdf' : 'json',
        claimExtractor: claimResult.ingestion?.extractor,
        claimPageCount: claimResult.ingestion?.pageCount,
        policyExtractor: policyResult.ingestion?.extractor,
        policyPageCount: policyResult.ingestion?.pageCount,
        claimMerged: claimResult.ingestion?.merged,
        claimMergedFileCount: claimResult.ingestion?.mergedFileCount,
        claimMergedFilenames: claimResult.ingestion?.mergedFilenames,
        policyMerged: policyResult.ingestion?.merged,
        policyMergedFileCount: policyResult.ingestion?.mergedFileCount,
        policyMergedFilenames: policyResult.ingestion?.mergedFilenames,
        rawParsedClaimPreview: claimResult.rawParsedDocument,
        rawParsedPolicyPreview: policyResult.rawParsedDocument,
        canonicalClaimPreview: claimResult.parsedDocument,
        canonicalPolicyPreview: policyResult.parsedDocument,
        parsedClaimPreview: claimResult.parsedDocument,
        parsedPolicyPreview: policyResult.parsedDocument,
        claimRawText: params.includeRawText ? claimResult.ingestion?.rawText : undefined,
        policyRawText: params.includeRawText ? policyResult.ingestion?.rawText : undefined
      }
    };
  }

  private requireFiles(
    files: Express.Multer.File[] | undefined,
    fieldName: 'claimDocument' | 'policyDocument'
  ) {
    if (!files?.length) {
      throw new BadRequestException(`Provide one or more PDF files in the "${fieldName}" form field.`);
    }

    files.forEach((file) => {
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException(`Every file in "${fieldName}" must be a PDF.`);
      }
    });

    return files;
  }

  private async parseTypedClaimDocuments(
    files: ClaimDocumentBuckets,
    includeRawText = false
  ): Promise<ParsedDocumentResult> {
    const orderedFiles = this.collectClaimFiles(files);
    const extraction = await this.documentOcrService.extractMany(orderedFiles);
    const rawParsedClaim = this.buildRawParsedDocument('claim', extraction.rawText);
    const parsedClaim = this.claimDocumentParserService.parse(extraction.rawText);

    return {
      rawParsedDocument: rawParsedClaim,
      parsedDocument: {
        ...parsedClaim,
        sourceDocuments: {
          filenames: orderedFiles.map((file) => file.originalname),
          hasDischargeSummary: Boolean(files.claimDischargeSummary?.length),
          hasFinalBill: Boolean(files.claimFinalBill?.length),
          hasItemizedBill: Boolean(files.claimItemizedBill?.length),
          hasClaimForm: Boolean(files.claimClaimForm?.length),
          hasPrescription: Boolean(files.claimPrescription?.length),
          hasInvestigationReport: Boolean(files.claimInvestigationReport?.length)
        }
      },
      ingestion: {
        sourceType: 'claim-pdf',
        extractor: extraction.provider,
        pageCount: extraction.pageCount,
        rawText: includeRawText ? extraction.rawText : undefined,
        merged: orderedFiles.length > 1,
        mergedFileCount: orderedFiles.length,
        mergedFilenames: orderedFiles.map((file) => file.originalname)
      }
    };
  }

  private async parseTypedPolicyDocuments(
    files: PolicyDocumentBuckets,
    includeRawText = false
  ): Promise<ParsedDocumentResult> {
    const orderedFiles = this.collectPolicyFiles(files);
    const extraction = await this.documentOcrService.extractMany(orderedFiles);
    const rawParsedPolicy = this.buildRawParsedDocument('policy', extraction.rawText);
    const parsedPolicy = this.policyDocumentParserService.parse(extraction.rawText);

    return {
      rawParsedDocument: rawParsedPolicy,
      parsedDocument: {
        ...parsedPolicy,
        sourceDocuments: {
          filenames: orderedFiles.map((file) => file.originalname),
          hasCertificate: Boolean(files.policyCertificate?.length),
          hasSchedule: Boolean(files.policySchedule?.length),
          hasWording: Boolean(files.policyWording?.length)
        }
      },
      ingestion: {
        sourceType: 'policy-pdf',
        extractor: extraction.provider,
        pageCount: extraction.pageCount,
        rawText: includeRawText ? extraction.rawText : undefined,
        merged: orderedFiles.length > 1,
        mergedFileCount: orderedFiles.length,
        mergedFilenames: orderedFiles.map((file) => file.originalname)
      }
    };
  }

  private collectClaimFiles(files?: ClaimDocumentBuckets): Express.Multer.File[] {
    return [
      ...(files?.claimFinalBill ?? []),
      ...(files?.claimDischargeSummary ?? []),
      ...(files?.claimItemizedBill ?? []),
      ...(files?.claimClaimForm ?? []),
      ...(files?.claimPrescription ?? []),
      ...(files?.claimInvestigationReport ?? []),
      ...(files?.claimDocument ?? [])
    ];
  }

  private collectPolicyFiles(files?: PolicyDocumentBuckets): Express.Multer.File[] {
    return [
      ...(files?.policyCertificate ?? []),
      ...(files?.policySchedule ?? []),
      ...(files?.policyWording ?? []),
      ...(files?.policyDocument ?? [])
    ];
  }

  private parseJsonField(rawJson: string | undefined, fieldName: string): Record<string, unknown> {
    if (!rawJson?.trim()) {
      throw new BadRequestException(
        `Provide either a PDF file or valid JSON in the "${fieldName}" form field.`
      );
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON must be an object.');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestException(
        `The "${fieldName}" form field must contain valid JSON. ${(error as Error).message}`
      );
    }
  }

  private buildRawParsedDocument(
    documentType: 'claim' | 'policy',
    rawText: string
  ): Record<string, unknown> {
    const normalized = this.ocrTextNormalizerService.normalize(rawText);

    return {
      documentType,
      normalizedText: normalized.text,
      lineCount: normalized.lines.length,
      lines: normalized.lines,
      pairs: normalized.pairs,
      pairMap: this.toPairMap(normalized),
      candidateSignals: this.extractCandidateSignals(documentType, normalized)
    };
  }

  private toPairMap(normalized: NormalizedOcrDocument): Record<string, string> {
    return normalized.pairs.reduce<Record<string, string>>((accumulator, pair) => {
      const key = pair.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (key && !accumulator[key]) {
        accumulator[key] = pair.value;
      }
      return accumulator;
    }, {});
  }

  private extractCandidateSignals(
    documentType: 'claim' | 'policy',
    normalized: NormalizedOcrDocument
  ): Record<string, unknown> {
    const signalLabels =
      documentType === 'claim'
        ? ['patient name', 'gender', 'age', 'bill no', 'claim no', 'admission date', 'discharge date']
        : ['policy no', 'policy number', 'room rent', 'waiting period', 'valid from', 'valid till'];

    const signals = signalLabels.reduce<Record<string, string>>((accumulator, label) => {
      const value = this.ocrTextNormalizerService.findPairValue(normalized.pairs, [label], {
        includes: true
      });
      if (value) {
        accumulator[label.replace(/\s+/g, '_')] = value;
      }
      return accumulator;
    }, {});

    return {
      firstLines: normalized.lines.slice(0, 20),
      detectedLabels: normalized.pairs.slice(0, 25),
      keySignals: signals
    };
  }

  private enrichParsedDocument(
    parsedDocument: Record<string, unknown>,
    documentType: 'claim' | 'policy',
    filenames: string[]
  ): Record<string, unknown> {
    return {
      ...parsedDocument,
      sourceDocuments: this.buildDocumentIndicators(documentType, filenames)
    };
  }

  private buildDocumentIndicators(
    documentType: 'claim' | 'policy',
    filenames: string[]
  ): Record<string, unknown> {
    const normalizedNames = filenames.map((name) => name.toLowerCase());

    if (documentType === 'claim') {
      return {
        filenames,
        hasDischargeSummary: normalizedNames.some((name) => /discharge|summary|\bds\b/.test(name)),
        hasFinalBill: normalizedNames.some((name) => /final.?bill|invoice|bill/.test(name)),
        hasItemizedBill: normalizedNames.some((name) => /itemi[sz]ed|detail|break.?up/.test(name)),
        hasClaimForm: normalizedNames.some((name) => /claim.?form/.test(name)),
        hasPrescription: normalizedNames.some((name) => /prescription|rx|doctor.?note/.test(name)),
        hasInvestigationReport: normalizedNames.some((name) => /investigation|lab|report|test/.test(name))
      };
    }

    return {
      filenames,
      hasCertificate: normalizedNames.some((name) => /certificate/.test(name)),
      hasSchedule: normalizedNames.some((name) => /schedule/.test(name)),
      hasWording: normalizedNames.some((name) => /wording|terms|condition/.test(name))
    };
  }
}
