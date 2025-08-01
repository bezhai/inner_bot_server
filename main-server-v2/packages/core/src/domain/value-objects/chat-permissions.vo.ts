export interface ChatPermissionsConfig {
  allowSendMessage?: boolean;
  allowSendPixivImage?: boolean;
  openRepeatMessage?: boolean;
  allowSendLimitPhoto?: boolean;
  canAccessRestrictedModels?: boolean;
  canAccessRestrictedPrompts?: boolean;
  newPermission?: boolean;
  isCanary?: boolean;
}

export class ChatPermissions {
  private readonly config: ChatPermissionsConfig;

  constructor(config: ChatPermissionsConfig) {
    this.config = {
      allowSendMessage: config.allowSendMessage ?? true,
      allowSendPixivImage: config.allowSendPixivImage ?? false,
      openRepeatMessage: config.openRepeatMessage ?? false,
      allowSendLimitPhoto: config.allowSendLimitPhoto ?? false,
      canAccessRestrictedModels: config.canAccessRestrictedModels ?? false,
      canAccessRestrictedPrompts: config.canAccessRestrictedPrompts ?? false,
      newPermission: config.newPermission ?? false,
      isCanary: config.isCanary ?? false,
    };
  }

  // Permission checks
  canSendMessage(): boolean {
    return this.config.allowSendMessage ?? true;
  }

  canSendPixivImage(): boolean {
    return this.config.allowSendPixivImage ?? false;
  }

  isRepeatEnabled(): boolean {
    return this.config.openRepeatMessage ?? false;
  }

  canSendLimitPhoto(): boolean {
    return this.config.allowSendLimitPhoto ?? false;
  }

  canAccessRestrictedModels(): boolean {
    return this.config.canAccessRestrictedModels ?? false;
  }

  canAccessRestrictedPrompts(): boolean {
    return this.config.canAccessRestrictedPrompts ?? false;
  }

  hasNewPermission(): boolean {
    return this.config.newPermission ?? false;
  }

  isCanary(): boolean {
    return this.config.isCanary ?? false;
  }

  // Permission modifications (returns new instance)
  enableRepeat(): ChatPermissions {
    return new ChatPermissions({
      ...this.config,
      openRepeatMessage: true,
    });
  }

  disableRepeat(): ChatPermissions {
    return new ChatPermissions({
      ...this.config,
      openRepeatMessage: false,
    });
  }

  enableSendMessage(): ChatPermissions {
    return new ChatPermissions({
      ...this.config,
      allowSendMessage: true,
    });
  }

  disableSendMessage(): ChatPermissions {
    return new ChatPermissions({
      ...this.config,
      allowSendMessage: false,
    });
  }

  grantAllPermissions(): ChatPermissions {
    return new ChatPermissions({
      allowSendMessage: true,
      allowSendPixivImage: true,
      openRepeatMessage: true,
      allowSendLimitPhoto: true,
      canAccessRestrictedModels: true,
      canAccessRestrictedPrompts: true,
      newPermission: true,
      isCanary: true,
    });
  }

  revokeAllPermissions(): ChatPermissions {
    return new ChatPermissions({
      allowSendMessage: false,
      allowSendPixivImage: false,
      openRepeatMessage: false,
      allowSendLimitPhoto: false,
      canAccessRestrictedModels: false,
      canAccessRestrictedPrompts: false,
      newPermission: false,
      isCanary: false,
    });
  }

  // Merge with another permission set (other permissions override)
  merge(other: Partial<ChatPermissionsConfig>): ChatPermissions {
    return new ChatPermissions({
      ...this.config,
      ...other,
    });
  }

  // Check if user has any special permissions
  hasSpecialPermissions(): boolean {
    return (
      this.canSendPixivImage() ||
      this.canSendLimitPhoto() ||
      this.canAccessRestrictedModels() ||
      this.canAccessRestrictedPrompts() ||
      this.hasNewPermission() ||
      this.isCanary()
    );
  }

  // Serialization
  toJSON(): ChatPermissionsConfig {
    return { ...this.config };
  }

  // Factory methods
  static default(): ChatPermissions {
    return new ChatPermissions({});
  }

  static allGranted(): ChatPermissions {
    return new ChatPermissions({}).grantAllPermissions();
  }

  static allDenied(): ChatPermissions {
    return new ChatPermissions({}).revokeAllPermissions();
  }
}