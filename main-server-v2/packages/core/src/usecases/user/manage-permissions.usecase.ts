export interface ManagePermissionsCommand {
  targetUserId: string;
  executedBy: string;
  action: 'grant_admin' | 'revoke_admin' | 'ban' | 'unban';
  reason?: string;
}

export interface ManagePermissionsResult {
  success: boolean;
  updatedUser?: {
    unionId: string;
    name: string;
    isAdmin: boolean;
    isBanned?: boolean;
  };
  error?: string;
}

export interface ManagePermissionsUseCase {
  execute(command: ManagePermissionsCommand): Promise<ManagePermissionsResult>;
}