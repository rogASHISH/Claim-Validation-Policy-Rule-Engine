import { Injectable } from '@nestjs/common';
import { PipelineService } from '../pipeline/pipeline.service';
import { ValidateClaimDto } from './dto/claim.dto';

@Injectable()
export class ClaimService {
  constructor(private readonly pipelineService: PipelineService) {}

  validateClaim(payload: ValidateClaimDto) {
    return this.pipelineService.validateClaim(payload);
  }
}
