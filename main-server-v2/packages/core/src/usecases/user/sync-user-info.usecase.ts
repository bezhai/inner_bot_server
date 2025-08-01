export interface SyncUserInfoCommand {
  unionId: string;
  openId?: string;
  name?: string;
  avatarUrl?: string;
  source: 'lark_event' | 'manual' | 'batch_sync';
}

export interface SyncUserInfoResult {
  success: boolean;
  user?: {
    unionId: string;
    name: string;
    avatarUrl?: string;
    openIds: string[];
    isNew: boolean;
  };
  error?: string;
}

export interface SyncUserInfoUseCase {
  execute(command: SyncUserInfoCommand): Promise<SyncUserInfoResult>;
}