import { LarkReceiveMessage, LarkHistoryMessage } from 'types/lark';
import { LarkMessageMetaInfo } from 'types/mongo';
import { LarkBaseChatInfo, LarkUser } from 'dal/entities';
import { MessageMetadata, MessageMetadataUtils } from './message-metadata';
import { MessageContent, MessageContentUtils } from './message-content';
import { MessageBuilder } from './message-builder';

export class Message {
    private metadata: MessageMetadata;
    private content: MessageContent;

    constructor(metadata: MessageMetadata, content: MessageContent) {
        this.metadata = metadata;
        this.content = content;
    }

    // Factory methods
    static async fromEvent(event: LarkReceiveMessage, content: MessageContent): Promise<Message> {
        const metadata = await MessageBuilder.buildMetadataFromEvent(event);
        return new Message(metadata, content);
    }

    static async fromMessage(message: LarkMessageMetaInfo): Promise<Message> {
        const metadata = MessageBuilder.buildMetadataFromInfo(message);
        const content = MessageBuilder.buildContentFromInfo(message);

        // const mentionMap =
        //     content.mentions.length > 0 ? await batchGetUserName(content.mentions) : undefined;
        // content.mentionMap = mentionMap;

        return new Message(metadata, content);
    }

    static fromHistoryMessage(message: LarkHistoryMessage): Message {
        const metadata = MessageBuilder.buildMetadataFromHistory(message);
        const content = MessageBuilder.buildContentFromHistory(message);
        return new Message(metadata, content);
    }

    // Metadata accessors
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

    get sender(): string {
        return this.metadata.sender;
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

    get basicChatInfo(): LarkBaseChatInfo | undefined {
        return this.metadata.basicChatInfo;
    }

    get senderInfo(): LarkUser | undefined {
        return this.metadata.senderInfo;
    }

    get createTime(): string | undefined {
        return this.metadata.createTime;
    }

    isP2P(): boolean {
        return MessageMetadataUtils.isP2P(this.metadata);
    }

    // Content accessors
    texts(): string[] {
        return MessageContentUtils.texts(this.content);
    }

    text(): string {
        return MessageContentUtils.fullText(this.content);
    }

    clearText(): string {
        return MessageContentUtils.clearText(this.content);
    }

    withoutEmojiText(): string {
        return MessageContentUtils.withoutEmojiText(this.content);
    }

    withMentionText(): string {
        return MessageContentUtils.withMentionText(this.content);
    }

    imageKeys(): string[] {
        return MessageContentUtils.imageKeys(this.content);
    }

    stickerKey(): string {
        return MessageContentUtils.stickerKey(this.content);
    }

    isTextOnly(): boolean {
        return MessageContentUtils.isTextOnly(this.content);
    }

    isStickerOnly(): boolean {
        return MessageContentUtils.isStickerOnly(this.content);
    }

    hasMention(openId: string): boolean {
        return this.content.mentions.includes(openId);
    }

    getMentionedUsers(): string[] {
        return this.content.mentions;
    }

    // For debugging
    toJSON() {
        return {
            metadata: this.metadata,
            content: this.content,
        };
    }

    toMarkdown(): string {
        return MessageContentUtils.toMarkdown(this.content, this.allowDownloadResource());
    }

    allowDownloadResource(): boolean {
        return this.metadata.groupChatInfo
            ? this.metadata.groupChatInfo.download_has_permission_setting === 'all_members'
            : true;
    }
}
