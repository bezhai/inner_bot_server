import { UnionId, OpenId } from '../value-objects/lark-ids.vo';

export class UserEntity {
  private readonly unionId: UnionId;
  private name: string;
  private avatarUrl?: string;
  private isAdmin: boolean;
  private openIds: Set<OpenId>;
  private readonly createdAt: Date;
  private updatedAt: Date;

  constructor(params: {
    unionId: string;
    name: string;
    avatarUrl?: string;
    isAdmin?: boolean;
    openIds?: string[];
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.unionId = new UnionId(params.unionId);
    this.name = params.name;
    this.avatarUrl = params.avatarUrl;
    this.isAdmin = params.isAdmin ?? false;
    this.openIds = new Set((params.openIds ?? []).map(id => new OpenId(id)));
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
  }

  // Getters
  get id(): string {
    return this.unionId.value;
  }

  getUnionId(): string {
    return this.unionId.value;
  }

  getName(): string {
    return this.name;
  }

  getAvatarUrl(): string | undefined {
    return this.avatarUrl;
  }

  getOpenIds(): string[] {
    return Array.from(this.openIds).map(openId => openId.value);
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // Domain logic
  canExecuteAdminCommands(): boolean {
    return this.isAdmin;
  }

  hasAccessToChat(chatPermissions: {
    allowedUsers?: string[];
    blockedUsers?: string[];
  }): boolean {
    const userId = this.unionId.value;
    
    // Check if user is blocked
    if (chatPermissions.blockedUsers?.includes(userId)) {
      return false;
    }
    
    // If there's an allowed list, user must be in it
    if (chatPermissions.allowedUsers && chatPermissions.allowedUsers.length > 0) {
      return chatPermissions.allowedUsers.includes(userId);
    }
    
    // Otherwise, user has access
    return true;
  }

  hasOpenId(openId: string): boolean {
    return Array.from(this.openIds).some(id => id.value === openId);
  }

  // Mutations
  updateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new Error('User name cannot be empty');
    }
    this.name = name;
    this.updatedAt = new Date();
  }

  updateAvatar(avatarUrl: string): void {
    this.avatarUrl = avatarUrl;
    this.updatedAt = new Date();
  }

  grantAdminAccess(): void {
    this.isAdmin = true;
    this.updatedAt = new Date();
  }

  revokeAdminAccess(): void {
    this.isAdmin = false;
    this.updatedAt = new Date();
  }

  addOpenId(openId: string): void {
    this.openIds.add(new OpenId(openId));
    this.updatedAt = new Date();
  }

  removeOpenId(openId: string): void {
    this.openIds.forEach(id => {
      if (id.value === openId) {
        this.openIds.delete(id);
      }
    });
    this.updatedAt = new Date();
  }

  // Serialization
  toJSON() {
    return {
      unionId: this.unionId.value,
      name: this.name,
      avatarUrl: this.avatarUrl,
      isAdmin: this.isAdmin,
      openIds: this.getOpenIds(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}