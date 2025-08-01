import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { CoreModule } from './modules/core.module';
import { WebhookModule } from './modules/webhook.module';
import { HealthModule } from './modules/health.module';
import { AdminModule } from './modules/admin.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    
    // Health checks
    TerminusModule,
    
    // Feature modules
    CoreModule,
    WebhookModule,
    HealthModule,
    AdminModule,
  ],
})
export class AppModule {}