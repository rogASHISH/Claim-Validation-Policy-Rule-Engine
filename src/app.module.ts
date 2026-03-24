import { Module } from '@nestjs/common';
import { ComparatorModule } from './modules/comparator/comparator.module';
import { ClaimModule } from './modules/claim/claim.module';
import { NormalizerModule } from './modules/normalizer/normalizer.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RuleEngineModule } from './modules/rule-engine/rule-engine.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    SharedModule,
    ClaimModule,
    PolicyModule,
    NormalizerModule,
    ComparatorModule,
    RuleEngineModule,
    PipelineModule
  ]
})
export class AppModule {}
