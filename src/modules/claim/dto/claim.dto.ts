import { Type } from "class-transformer";
import {
  Allow,
  IsArray,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class DynamicRuleDto {
  @IsString()
  code!: string;

  @IsString()
  field!: string;

  @IsIn([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "includes",
    "not_includes",
    "exists",
    "not_exists",
  ])
  operator!:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in"
    | "not_in"
    | "includes"
    | "not_includes"
    | "exists"
    | "not_exists";

  @IsOptional()
  @IsString()
  referenceField?: string;

  @IsOptional()
  @Allow()
  expectedValue?: unknown;

  @IsOptional()
  @IsIn(["FAIL", "WARNING"])
  failureStatus?: "FAIL" | "WARNING";

  @IsOptional()
  @IsIn(["none", "review", "partial approval", "possible rejection"])
  impact?: "none" | "review" | "partial approval" | "possible rejection";

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BuiltInFieldMappingsDto {
  @IsOptional()
  @IsString()
  roomRentClaimPath?: string;

  @IsOptional()
  @IsString()
  roomRentLimitPolicyPath?: string;

  @IsOptional()
  @IsString()
  treatmentNameClaimPath?: string;

  @IsOptional()
  @IsString()
  coveredTreatmentsPolicyPath?: string;

  @IsOptional()
  @IsString()
  policyAgeMonthsPolicyPath?: string;

  @IsOptional()
  @IsString()
  waitingPeriodMonthsPolicyPath?: string;

  @IsOptional()
  @IsString()
  billingItemsClaimPath?: string;
}

export class PolicyEngineConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BuiltInFieldMappingsDto)
  fieldMappings?: BuiltInFieldMappingsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicRuleDto)
  customRules?: DynamicRuleDto[];
}

export class ValidateClaimDto {
  @IsDefined()
  @IsObject()
  @Allow()
  claim!: Record<string, unknown>;

  @IsDefined()
  @IsObject()
  @Allow()
  policy!: Record<string, unknown> & {
    engineConfig?: PolicyEngineConfigDto;
  };
}
