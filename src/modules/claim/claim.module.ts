import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ClaimController } from './claim.controller';
import { ClaimService } from './claim.service';

@Module({
  imports: [PipelineModule],
  controllers: [ClaimController],
  providers: [ClaimService]
})
export class ClaimModule {}
