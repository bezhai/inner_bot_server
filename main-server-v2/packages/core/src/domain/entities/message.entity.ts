import { MessageContent } from '../value-objects/message-content.vo';
import { MessageMetadata } from '../value-objects/message-metadata.vo';
import { DomainEvent } from '../events/domain-event';

export class MessageEntity {
  private readonly metadata: MessageMetadata;
  private readonly content: MessageContent;
  private readonly domainEvents: DomainEvent[] = [];

  constructor(metadata: MessageMetadata, content: MessageContent) {
    this.metadata = metadata;
    this.content = content;
  }

  // Metadata accessors
  get id(): string {
    return this.metadata.messageId;
  }

  get messageId(): string {
    return this.metadata.messageId;
  }

  get rootId(): string | undefined {
    return this.metadata.rootId;
  }

  get parentMessageId(): string | undefined {
    return this.metadata.parentMessageId;
  }

  get threadId(): string | undefined {
    return this.metadata.threadId;
  }

  get chatId(): string {
    return this.metadata.chatId;
  }

  get senderId(): string {
    return this.metadata.senderId;
  }

  get senderOpenId(): string | undefined {
    return this.metadata.senderOpenId;
  }

  get senderName(): string | undefined {
    return this.metadata.senderName;
  }

  get chatType(): string {
    return this.metadata.chatType;
  }

  get isRobotMessage(): boolean {
    return this.metadata.isRobotMessage;
  }

  get createTime(): Date | undefined {
    return this.metadata.createTime;
  }

  // Content accessors
  texts(): string[] {
    return this.content.texts();
  }

  text(): string {
    return this.content.fullText();
  }

  clearText(): string {
    return this.content.clearText();
  }

  withoutEmojiText(): string {
    return this.content.withoutEmojiText();
  }

  withMentionText(): string {
    return this.content.withMentionText();
  }

  imageKeys(): string[] {
    return this.content.imageKeys();
  }

  stickerKey(): string {
    return this.content.stickerKey();
  }

  // Domain logic methods
  isTextOnly(): boolean {
    return this.content.isTextOnly();
  }

  isStickerOnly(): boolean {
    return this.content.isStickerOnly();
  }

  isP2P(): boolean {
    return this.metadata.isP2P();
  }

  isInGroup(): boolean {
    return !this.isP2P();
  }

  hasMention(userId: string): boolean {
    return this.content.hasMention(userId);
  }

  isMentioned(): boolean {
    return this.content.mentions.length > 0;
  }

  getMentionedUsers(): string[] {
    return this.content.mentions;
  }

  isFromAdmin(adminUserIds: string[]): boolean {
    return adminUserIds.includes(this.senderId);
  }

  isCommand(): boolean {
    const text = this.clearText();
    return text.startsWith('/') || text.startsWith('!');
  }

  extractCommand(): { command: string; args: string[] } | null {
    if (!this.isCommand()) return null;
    
    const text = this.clearText();
    const parts = text.slice(1).split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    return { command, args };
  }

  shouldTriggerReply(botUserId: string): boolean {
    // P2P messages always trigger reply
    if (this.isP2P()) return true;
    
    // Group messages only trigger reply if bot is mentioned
    return this.hasMention(botUserId);
  }

  toMarkdown(): string {
    return this.content.toMarkdown();
  }

  // Domain events
  addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }

  clearDomainEvents(): void {
    this.domainEvents.length = 0;
  }

  // For debugging
  toJSON() {
    return {
      metadata: this.metadata,
      content: this.content,
    };
  }
}