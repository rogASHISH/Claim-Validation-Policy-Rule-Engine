import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { BadRequestException, Injectable } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { recognize } from 'tesseract.js';

export interface DocumentOcrResult {
  rawText: string;
  provider: string;
  pageCount: number;
}

const execFileAsync = promisify(execFile);

@Injectable()
export class DocumentOcrService {
  async extract(file: Express.Multer.File): Promise<DocumentOcrResult> {
    if (!file) {
      throw new BadRequestException('A PDF document is required.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF documents are supported right now.');
    }

    const extraction = await pdfParse(file.buffer);
    const parsedText = this.cleanText(extraction.text ?? '');

    if (parsedText) {
      return {
        rawText: parsedText,
        provider: 'pdf-parse',
        pageCount: extraction.numpages ?? 0
      };
    }

    const ocrText = await this.extractWithRenderedImage(file);
    if (!ocrText) {
      throw new BadRequestException(
        'No readable text was found in the PDF. The document appears to be scanned, and OCR could not extract usable text.'
      );
    }

    return {
      rawText: ocrText,
      provider: 'tesseract-fallback',
      pageCount: extraction.numpages ?? 0
    };
  }

  async extractMany(files: Express.Multer.File[]): Promise<DocumentOcrResult> {
    if (!files.length) {
      throw new BadRequestException('At least one PDF document is required.');
    }

    const extractions = await Promise.all(files.map((file) => this.extract(file)));
    const rawText = extractions
      .map((extraction, index) => `\n\n--- Document ${index + 1}: ${files[index].originalname} ---\n${extraction.rawText}`)
      .join('\n')
      .trim();

    return {
      rawText,
      provider: [...new Set(extractions.map((extraction) => extraction.provider))].join('+'),
      pageCount: extractions.reduce((sum, extraction) => sum + extraction.pageCount, 0)
    };
  }

  private cleanText(value: string): string {
    return value
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async extractWithRenderedImage(file: Express.Multer.File): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), 'claim-doc-ocr-'));
    const pdfPath = join(tempDir, 'source.pdf');
    const pngPath = join(tempDir, 'rendered.png');

    try {
      await writeFile(pdfPath, file.buffer);

      await this.renderPdfToImage(pdfPath, pngPath);

      const result = await recognize(pngPath, 'eng', {
        logger: () => undefined
      });

      return this.cleanText(result.data.text ?? '');
    } catch {
      return '';
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async renderPdfToImage(pdfPath: string, pngPath: string): Promise<void> {
    try {
      const outputDir = join(tmpdir(), `claim-doc-ql-${Date.now()}`);
      await execFileAsync('mkdir', ['-p', outputDir]);
      await execFileAsync('qlmanage', ['-t', '-s', '2400', '-o', outputDir, pdfPath]);
      const generatedPath = join(outputDir, `${pdfPath.split('/').pop()}.png`);
      await execFileAsync('mv', [generatedPath, pngPath]);
      await rm(outputDir, { recursive: true, force: true });
      return;
    } catch {
      await execFileAsync('sips', ['-s', 'format', 'png', pdfPath, '--out', pngPath]);
    }
  }
}
