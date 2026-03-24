import { Module } from '@nestjs/common';
import { NormalizerService } from './normalizer.service';

@Module({
  providers: [NormalizerService],
  exports: [NormalizerService]
})
export class NormalizerModule {}
