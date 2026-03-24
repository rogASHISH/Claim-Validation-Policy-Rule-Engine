import { Module } from '@nestjs/common';
import { ComparatorModule } from '../comparator/comparator.module';
import { NormalizerModule } from '../normalizer/normalizer.module';
import { PolicyModule } from '../policy/policy.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [PolicyModule, RuleEngineModule, ComparatorModule, NormalizerModule],
  providers: [PipelineService],
  exports: [PipelineService]
})
export class PipelineModule {}
