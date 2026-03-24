import { Module } from '@nestjs/common';
import { ComparatorService } from './comparator.service';

@Module({
  providers: [ComparatorService],
  exports: [ComparatorService]
})
export class ComparatorModule {}
