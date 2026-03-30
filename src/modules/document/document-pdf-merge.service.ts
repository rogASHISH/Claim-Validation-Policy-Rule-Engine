import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

export type MergedPdfResult = {
  file: Express.Multer.File;
  merge: {
    merged: boolean;
    fileCount: number;
    filenames: string[];
  };
};

@Injectable()
export class DocumentPdfMergeService {
  async mergePdfFiles(
    files: Express.Multer.File[] | undefined,
    fieldName: 'claimDocument' | 'policyDocument'
  ): Promise<MergedPdfResult | null> {
    if (!files?.length) {
      return null;
    }

    files.forEach((file) => {
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException(`Every file in "${fieldName}" must be a PDF.`);
      }
    });

    if (files.length === 1) {
      return {
        file: files[0],
        merge: {
          merged: false,
          fileCount: 1,
          filenames: [files[0].originalname]
        }
      };
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const source = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(source, source.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBuffer = Buffer.from(await mergedPdf.save());
    const mergedFilename = this.buildMergedFilename(files.map((file) => file.originalname));

    return {
      file: {
        ...files[0],
        originalname: mergedFilename,
        size: mergedBuffer.length,
        buffer: mergedBuffer
      },
      merge: {
        merged: true,
        fileCount: files.length,
        filenames: files.map((file) => file.originalname)
      }
    };
  }

  private buildMergedFilename(filenames: string[]): string {
    const first = filenames[0].replace(/\.pdf$/i, '');
    return `${first}-merged-batch.pdf`;
  }
}
