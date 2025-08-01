import { ChatPermissionsConfig } from '../../domain/value-objects/chat-permissions.vo';

export interface ManageGroupSettingsCommand {
  chatId: string;
  executedBy: string;
  action: 'enable_repeat' | 'disable_repeat' | 'update_permissions' | 'update_info';
  payload?: {
    permissions?: Partial<ChatPermissionsConfig>;
    name?: string;
    ownerOpenId?: string;
  };
}

export interface ManageGroupSettingsResult {
  success: boolean;
  updatedSettings?: {
    chatId: string;
    name?: string;
    permissions: ChatPermissionsConfig;
    ownerOpenId?: string;
  };
  error?: string;
}

export interface ManageGroupSettingsUseCase {
  execute(command: ManageGroupSettingsCommand): Promise<ManageGroupSettingsResult>;
}