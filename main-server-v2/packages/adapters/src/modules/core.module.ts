import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { 
  ProcessMessageUseCase,
  GenerateAIReplyUseCase,
  HandleAdminCommandUseCase,
  ManageGroupSettingsUseCase,
  GenerateHistoryUseCase,
  ManagePermissionsUseCase,
  SyncUserInfoUseCase,
  ProcessMessageUseCaseImpl,
  GenerateAIReplyUseCaseImpl,
  MessageRuleEngine,
  RepeatMessageRule,
  AdminCommandRule,
  AIReplyRule,
  AIService,
} from '@main-server-v2/core';
import { InfraModule } from '@main-server-v2/infra';
import { LarkModule } from './lark.module';
import { AIServiceAdapter } from '../ai/ai-service.adapter';

// Placeholder implementations for use cases not yet implemented
class HandleAdminCommandUseCaseImpl implements HandleAdminCommandUseCase {
  async execute(command: any): Promise<any> {
    // TODO: Implement
    return { success: true };
  }
}

class ManageGroupSettingsUseCaseImpl implements ManageGroupSettingsUseCase {
  async execute(command: any): Promise<any> {
    // TODO: Implement
    return { success: true };
  }
}

class GenerateHistoryUseCaseImpl implements GenerateHistoryUseCase {
  async execute(command: any): Promise<any> {
    // TODO: Implement
    return { success: true };
  }
}

class ManagePermissionsUseCaseImpl implements ManagePermissionsUseCase {
  async execute(command: any): Promise<any> {
    // TODO: Implement
    return { success: true };
  }
}

class SyncUserInfoUseCaseImpl implements SyncUserInfoUseCase {
  async execute(command: any): Promise<any> {
    // TODO: Implement
    return { success: true };
  }
}

@Module({
  imports: [
    InfraModule,
    LarkModule,
    HttpModule,
  ],
  providers: [
    // AI Service
    {
      provide: AIService,
      useClass: AIServiceAdapter,
    },
    
    // Message Rules
    RepeatMessageRule,
    AdminCommandRule,
    AIReplyRule,
    
    // Rule Engine
    {
      provide: MessageRuleEngine,
      useFactory: (repeatRule: RepeatMessageRule, adminRule: AdminCommandRule, aiRule: AIReplyRule) => {
        return new MessageRuleEngine([repeatRule, adminRule, aiRule]);
      },
      inject: [RepeatMessageRule, AdminCommandRule, AIReplyRule],
    },
    
    // Use Cases
    {
      provide: ProcessMessageUseCase,
      useClass: ProcessMessageUseCaseImpl,
    },
    {
      provide: GenerateAIReplyUseCase,
      useClass: GenerateAIReplyUseCaseImpl,
    },
    {
      provide: HandleAdminCommandUseCase,
      useClass: HandleAdminCommandUseCaseImpl,
    },
    {
      provide: ManageGroupSettingsUseCase,
      useClass: ManageGroupSettingsUseCaseImpl,
    },
    {
      provide: GenerateHistoryUseCase,
      useClass: GenerateHistoryUseCaseImpl,
    },
    {
      provide: ManagePermissionsUseCase,
      useClass: ManagePermissionsUseCaseImpl,
    },
    {
      provide: SyncUserInfoUseCase,
      useClass: SyncUserInfoUseCaseImpl,
    },
  ],
  exports: [
    ProcessMessageUseCase,
    GenerateAIReplyUseCase,
    HandleAdminCommandUseCase,
    ManageGroupSettingsUseCase,
    GenerateHistoryUseCase,
    ManagePermissionsUseCase,
    SyncUserInfoUseCase,
    AIService,
  ],
})
export class CoreModule {}