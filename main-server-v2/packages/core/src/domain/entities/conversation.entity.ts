import { ChatId } from '../value-objects/lark-ids.vo';
import { ChatPermissions } from '../value-objects/chat-permissions.vo';
import { MessageEntity } from './message.entity';

export enum ChatType {
  P2P = 'p2p',
  Group = 'group',
  Topic = 'topic',
}

export class ConversationEntity {
  private readonly chatId: ChatId;
  private name?: string;
  private chatType: ChatType;
  private ownerOpenId?: string;
  private permissions: ChatPermissions;
  private hasMainBot: boolean;
  private hasDevBot: boolean;
  private readonly createdAt: Date;
  private updatedAt: Date;

  constructor(params: {
    chatId: string;
    name?: string;
    chatType: ChatType;
    ownerOpenId?: string;
    permissions?: ChatPermissions;
    hasMainBot?: boolean;
    hasDevBot?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.chatId = new ChatId(params.chatId);
    this.name = params.name;
    this.chatType = params.chatType;
    this.ownerOpenId = params.ownerOpenId;
    this.permissions = params.permissions ?? new ChatPermissions({});
    this.hasMainBot = params.hasMainBot ?? false;
    this.hasDevBot = params.hasDevBot ?? false;
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
  }

  // Getters
  get id(): string {
    return this.chatId.value;
  }

  getChatId(): string {
    return this.chatId.value;
  }

  getName(): string | undefined {
    return this.name;
  }

  getChatType(): ChatType {
    return this.chatType;
  }

  getOwnerOpenId(): string | undefined {
    return this.ownerOpenId;
  }

  getPermissions(): ChatPermissions {
    return this.permissions;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // Domain logic
  isP2P(): boolean {
    return this.chatType === ChatType.P2P;
  }

  isGroup(): boolean {
    return this.chatType === ChatType.Group;
  }

  isTopic(): boolean {
    return this.chatType === ChatType.Topic;
  }

  isRepeatEnabled(): boolean {
    return this.permissions.isRepeatEnabled();
  }

  canSendMessage(): boolean {
    return this.permissions.canSendMessage();
  }

  canSendPixivImage(): boolean {
    return this.permissions.canSendPixivImage();
  }

  canSendLimitPhoto(): boolean {
    return this.permissions.canSendLimitPhoto();
  }

  canAccessRestrictedModels(): boolean {
    return this.permissions.canAccessRestrictedModels();
  }

  canAccessRestrictedPrompts(): boolean {
    return this.permissions.canAccessRestrictedPrompts();
  }

  isCanary(): boolean {
    return this.permissions.isCanary();
  }

  canGenerateHistory(): boolean {
    // Only group chats can generate history
    return this.isGroup() && this.hasMainBot;
  }

  shouldProcessMessage(message: MessageEntity): boolean {
    // Always process P2P messages
    if (this.isP2P()) return true;

    // Check if conversation allows message processing
    if (!this.canSendMessage()) return false;

    // Check specific permissions based on message content
    if (message.imageKeys().length > 0 && !this.canSendLimitPhoto()) {
      return false;
    }

    return true;
  }

  // Mutations
  updateName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
  }

  updateOwner(ownerOpenId: string): void {
    this.ownerOpenId = ownerOpenId;
    this.updatedAt = new Date();
  }

  updatePermissions(permissions: Partial<ChatPermissions>): void {
    this.permissions = new ChatPermissions({
      ...this.permissions.toJSON(),
      ...permissions,
    });
    this.updatedAt = new Date();
  }

  enableRepeat(): void {
    this.permissions = this.permissions.enableRepeat();
    this.updatedAt = new Date();
  }

  disableRepeat(): void {
    this.permissions = this.permissions.disableRepeat();
    this.updatedAt = new Date();
  }

  addMainBot(): void {
    this.hasMainBot = true;
    this.updatedAt = new Date();
  }

  removeMainBot(): void {
    this.hasMainBot = false;
    this.updatedAt = new Date();
  }

  addDevBot(): void {
    this.hasDevBot = true;
    this.updatedAt = new Date();
  }

  removeDevBot(): void {
    this.hasDevBot = false;
    this.updatedAt = new Date();
  }

  // Serialization
  toJSON() {
    return {
      chatId: this.chatId.value,
      name: this.name,
      chatType: this.chatType,
      ownerOpenId: this.ownerOpenId,
      permissions: this.permissions.toJSON(),
      hasMainBot: this.hasMainBot,
      hasDevBot: this.hasDevBot,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}