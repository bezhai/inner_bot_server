import { Module } from '@nestjs/common';
import { WebhookController } from '../http/controllers/webhook.controller';
import { CoreModule } from './core.module';

@Module({
  imports: [CoreModule],
  controllers: [WebhookController],
})
export class WebhookModule {}