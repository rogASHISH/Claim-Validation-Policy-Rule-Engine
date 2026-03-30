import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ClaimDocumentParserService } from './claim-document-parser.service';
import { DocumentController } from './document.controller';
import { DocumentOcrService } from './document-ocr.service';
import { DocumentPdfMergeService } from './document-pdf-merge.service';
import { DocumentService } from './document.service';
import { OcrTextNormalizerService } from './ocr-text-normalizer.service';
import { PolicyDocumentParserService } from './policy-document-parser.service';

@Module({
  imports: [PipelineModule],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    DocumentOcrService,
    DocumentPdfMergeService,
    OcrTextNormalizerService,
    ClaimDocumentParserService,
    PolicyDocumentParserService
  ]
})
export class DocumentModule {}
