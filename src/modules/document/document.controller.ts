import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentService } from './document.service';

@Controller()
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('parse/claim-pdf')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'claimDocument', maxCount: 10 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  validateClaimPdf(
    @UploadedFiles()
    files: {
      claimDocument?: Express.Multer.File[];
    },
    @Body('includeRawText') includeRawText?: string
  ) {
    return this.documentService.parseClaimPdf(files.claimDocument, includeRawText === 'true');
  }

  @Post('parse/policy-pdf')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'policyDocument', maxCount: 10 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  parsePolicyPdf(
    @UploadedFiles()
    files: {
      policyDocument?: Express.Multer.File[];
    },
    @Body('includeRawText') includeRawText?: string
  ) {
    return this.documentService.parsePolicyPdf(files.policyDocument, includeRawText === 'true');
  }

  @Post('validate-claim/document')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'claimDocument', maxCount: 10 },
        { name: 'claimDischargeSummary', maxCount: 10 },
        { name: 'claimFinalBill', maxCount: 10 },
        { name: 'claimItemizedBill', maxCount: 10 },
        { name: 'claimClaimForm', maxCount: 10 },
        { name: 'claimPrescription', maxCount: 10 },
        { name: 'claimInvestigationReport', maxCount: 10 },
        { name: 'policyDocument', maxCount: 10 },
        { name: 'policyCertificate', maxCount: 10 },
        { name: 'policySchedule', maxCount: 10 },
        { name: 'policyWording', maxCount: 10 }
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024
        }
      }
    )
  )
  validateClaimDocument(
    @UploadedFiles()
    files: {
      claimDocument?: Express.Multer.File[];
      claimDischargeSummary?: Express.Multer.File[];
      claimFinalBill?: Express.Multer.File[];
      claimItemizedBill?: Express.Multer.File[];
      claimClaimForm?: Express.Multer.File[];
      claimPrescription?: Express.Multer.File[];
      claimInvestigationReport?: Express.Multer.File[];
      policyDocument?: Express.Multer.File[];
      policyCertificate?: Express.Multer.File[];
      policySchedule?: Express.Multer.File[];
      policyWording?: Express.Multer.File[];
    },
    @Body('claimJson') claimJson?: string,
    @Body('policyJson') policyJson?: string,
    @Body('includeRawText') includeRawText?: string
    ) {
    return this.documentService.validateMixedInputs({
      claimDocuments: {
        claimDocument: files.claimDocument,
        claimDischargeSummary: files.claimDischargeSummary,
        claimFinalBill: files.claimFinalBill,
        claimItemizedBill: files.claimItemizedBill,
        claimClaimForm: files.claimClaimForm,
        claimPrescription: files.claimPrescription,
        claimInvestigationReport: files.claimInvestigationReport
      },
      policyDocuments: {
        policyDocument: files.policyDocument,
        policyCertificate: files.policyCertificate,
        policySchedule: files.policySchedule,
        policyWording: files.policyWording
      },
      claimJson,
      policyJson,
      includeRawText: includeRawText === 'true'
    });
  }
}
