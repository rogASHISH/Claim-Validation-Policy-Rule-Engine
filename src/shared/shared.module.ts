import { Global, Module } from '@nestjs/common';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { ConfigService } from '../config/config.service';

@Global()
@Module({
  providers: [AppLoggerService, ConfigService, LoggingInterceptor, HttpExceptionFilter],
  exports: [AppLoggerService, ConfigService, LoggingInterceptor, HttpExceptionFilter]
})
export class SharedModule {}
