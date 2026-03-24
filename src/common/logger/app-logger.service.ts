import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLoggerService {
  private readonly logger = new Logger('DataReconciliationPlatform');

  log(message: string, context?: string): void {
    this.logger.log(message, context);
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, trace, context);
  }
}
