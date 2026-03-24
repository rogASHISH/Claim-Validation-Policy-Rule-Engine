import { Body, Controller, Post } from '@nestjs/common';
import { ClaimService } from './claim.service';
import { ValidateClaimDto } from './dto/claim.dto';

@Controller()
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Post('validate-claim')
  validateClaim(@Body() payload: ValidateClaimDto) {
    return this.claimService.validateClaim(payload);
  }
}
