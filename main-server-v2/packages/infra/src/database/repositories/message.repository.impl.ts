import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MessageRepository, MessageEntity, MessageMetadata, MessageContent } from '@main-server-v2/core';

@Injectable()
export class MessageRepositoryImpl implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(message: MessageEntity): Promise<void> {
    const messageData = message.toJSON();
    
    await this.prisma.message.create({
      data: {
        messageId: messageData.metadata.messageId,
        chatId: messageData.metadata.chatId,
        senderId: messageData.metadata.senderId,
        senderOpenId: messageData.metadata.senderOpenId,
        content: messageData.content,
        metadata: messageData.metadata,
        messageType: messageData.metadata.chatType,
        rootId: messageData.metadata.rootId,
        parentId: messageData.metadata.parentMessageId,
        threadId: messageData.metadata.threadId,
        processed: true,
      },
    });
  }

  async findById(messageId: string): Promise<MessageEntity | null> {
    const message = await this.prisma.message.findUnique({
      where: { messageId },
    });

    if (!message) return null;

    return this.toDomainEntity(message);
  }

  async findByConversation(
    chatId: string,
    options?: { limit?: number; before?: Date; after?: Date }
  ): Promise<MessageEntity[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(options?.before && { createdAt: { lt: options.before } }),
        ...(options?.after && { createdAt: { gt: options.after } }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
    });

    return messages.map(msg => this.toDomainEntity(msg));
  }

  async findDuplicates(
    content: string,
    chatId: string,
    timeWindow?: number
  ): Promise<MessageEntity[]> {
    const since = timeWindow 
      ? new Date(Date.now() - timeWindow * 1000)
      : new Date(Date.now() - 60000); // Default 1 minute

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        createdAt: { gte: since },
        content: {
          path: ['items'],
          array_contains: [{ type: 'text', value: content }],
        },
      },
    });

    return messages.map(msg => this.toDomainEntity(msg));
  }

  async findByThreadId(threadId: string): Promise<MessageEntity[]> {
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(msg => this.toDomainEntity(msg));
  }

  async markAsProcessed(messageId: string): Promise<void> {
    await this.prisma.message.update({
      where: { messageId },
      data: { processed: true },
    });
  }

  async countByChat(
    chatId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<number> {
    return this.prisma.message.count({
      where: {
        chatId,
        ...(options?.startDate && { createdAt: { gte: options.startDate } }),
        ...(options?.endDate && { createdAt: { lte: options.endDate } }),
      },
    });
  }

  async deleteById(messageId: string): Promise<void> {
    await this.prisma.message.delete({
      where: { messageId },
    });
  }

  async deleteByChat(chatId: string): Promise<number> {
    const result = await this.prisma.message.deleteMany({
      where: { chatId },
    });
    return result.count;
  }

  private toDomainEntity(dbMessage: any): MessageEntity {
    const metadata = new MessageMetadata({
      messageId: dbMessage.messageId,
      rootId: dbMessage.rootId,
      parentMessageId: dbMessage.parentId,
      threadId: dbMessage.threadId,
      chatId: dbMessage.chatId,
      senderId: dbMessage.senderId,
      senderOpenId: dbMessage.senderOpenId,
      messageType: dbMessage.messageType,
      chatType: dbMessage.chat?.chatMode || 'group',
      createTime: dbMessage.createdAt.toISOString(),
      updateTime: dbMessage.createdAt.toISOString(),
    });

    const content = new MessageContent({
      items: dbMessage.content?.items || [],
      mentions: dbMessage.content?.mentions || [],
      mentionMap: dbMessage.content?.mentionMap || {},
    });

    return new MessageEntity(metadata, content);
  }
}