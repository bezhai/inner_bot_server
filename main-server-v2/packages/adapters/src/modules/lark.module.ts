import { Module } from '@nestjs/common';
import { LarkApiClient } from '../lark/lark-api.client';

@Module({
  providers: [LarkApiClient],
  exports: [LarkApiClient],
})
export class LarkModule {}