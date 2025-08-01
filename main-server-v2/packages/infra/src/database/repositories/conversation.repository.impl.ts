import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { 
  ConversationRepository, 
  ConversationEntity, 
  ChatType,
  ChatPermissionsConfig 
} from '@main-server-v2/core';

@Injectable()
export class ConversationRepositoryImpl implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(conversation: ConversationEntity): Promise<void> {
    const data = conversation.toJSON();
    
    await this.prisma.larkBaseChatInfo.upsert({
      where: { chatId: data.chatId },
      update: {
        chatMode: data.chatType,
        permissionConfig: data.permissions,
        hasMainBot: data.hasMainBot,
        hasDevBot: data.hasDevBot,
        updatedAt: new Date(),
      },
      create: {
        chatId: data.chatId,
        chatMode: data.chatType,
        permissionConfig: data.permissions,
        hasMainBot: data.hasMainBot,
        hasDevBot: data.hasDevBot,
      },
    });

    // Update group info if it's a group chat
    if (data.chatType === ChatType.Group && data.name) {
      await this.prisma.larkGroupChatInfo.upsert({
        where: { chatId: data.chatId },
        update: {
          name: data.name,
          ownerOpenId: data.ownerOpenId,
          updatedAt: new Date(),
        },
        create: {
          chatId: data.chatId,
          name: data.name,
          ownerOpenId: data.ownerOpenId,
        },
      });
    }
  }

  async findByChatId(chatId: string): Promise<ConversationEntity | null> {
    const chatInfo = await this.prisma.larkBaseChatInfo.findUnique({
      where: { chatId },
      include: { groupInfo: true },
    });

    if (!chatInfo) return null;

    return this.toDomainEntity(chatInfo);
  }

  async findByIds(chatIds: string[]): Promise<ConversationEntity[]> {
    const chats = await this.prisma.larkBaseChatInfo.findMany({
      where: { chatId: { in: chatIds } },
      include: { groupInfo: true },
    });

    return chats.map(chat => this.toDomainEntity(chat));
  }

  async findByType(
    chatType: ChatType,
    options?: { limit?: number; offset?: number }
  ): Promise<ConversationEntity[]> {
    const chats = await this.prisma.larkBaseChatInfo.findMany({
      where: { chatMode: chatType },
      include: { groupInfo: true },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });

    return chats.map(chat => this.toDomainEntity(chat));
  }

  async updatePermissions(
    chatId: string,
    permissions: Partial<ChatPermissionsConfig>
  ): Promise<void> {
    const existing = await this.prisma.larkBaseChatInfo.findUnique({
      where: { chatId },
      select: { permissionConfig: true },
    });

    if (!existing) throw new Error('Chat not found');

    const updatedPermissions = {
      ...(existing.permissionConfig as any || {}),
      ...permissions,
    };

    await this.prisma.larkBaseChatInfo.update({
      where: { chatId },
      data: { 
        permissionConfig: updatedPermissions,
        updatedAt: new Date(),
      },
    });
  }

  async updateChatInfo(
    chatId: string,
    updates: { name?: string; ownerOpenId?: string }
  ): Promise<void> {
    if (updates.name || updates.ownerOpenId) {
      await this.prisma.larkGroupChatInfo.upsert({
        where: { chatId },
        update: {
          ...(updates.name && { name: updates.name }),
          ...(updates.ownerOpenId && { ownerOpenId: updates.ownerOpenId }),
          updatedAt: new Date(),
        },
        create: {
          chatId,
          name: updates.name,
          ownerOpenId: updates.ownerOpenId,
        },
      });
    }
  }

  async addBot(chatId: string, botType: 'main' | 'dev'): Promise<void> {
    const field = botType === 'main' ? 'hasMainBot' : 'hasDevBot';
    await this.prisma.larkBaseChatInfo.update({
      where: { chatId },
      data: { 
        [field]: true,
        updatedAt: new Date(),
      },
    });
  }

  async removeBot(chatId: string, botType: 'main' | 'dev'): Promise<void> {
    const field = botType === 'main' ? 'hasMainBot' : 'hasDevBot';
    await this.prisma.larkBaseChatInfo.update({
      where: { chatId },
      data: { 
        [field]: false,
        updatedAt: new Date(),
      },
    });
  }

  async findWithRepeatEnabled(): Promise<ConversationEntity[]> {
    const chats = await this.prisma.larkBaseChatInfo.findMany({
      where: {
        permissionConfig: {
          path: ['openRepeatMessage'],
          equals: true,
        },
      },
      include: { groupInfo: true },
    });

    return chats.map(chat => this.toDomainEntity(chat));
  }

  async findCanaryChats(): Promise<ConversationEntity[]> {
    const chats = await this.prisma.larkBaseChatInfo.findMany({
      where: {
        permissionConfig: {
          path: ['isCanary'],
          equals: true,
        },
      },
      include: { groupInfo: true },
    });

    return chats.map(chat => this.toDomainEntity(chat));
  }

  async search(
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ConversationEntity[]> {
    const chats = await this.prisma.larkBaseChatInfo.findMany({
      where: {
        OR: [
          { chatId: { contains: query } },
          { groupInfo: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { groupInfo: true },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });

    return chats.map(chat => this.toDomainEntity(chat));
  }

  async count(filters?: {
    chatType?: ChatType;
    hasMainBot?: boolean;
    hasDevBot?: boolean;
  }): Promise<number> {
    return this.prisma.larkBaseChatInfo.count({
      where: {
        ...(filters?.chatType && { chatMode: filters.chatType }),
        ...(filters?.hasMainBot !== undefined && { hasMainBot: filters.hasMainBot }),
        ...(filters?.hasDevBot !== undefined && { hasDevBot: filters.hasDevBot }),
      },
    });
  }

  async deleteByChatId(chatId: string): Promise<void> {
    await this.prisma.larkBaseChatInfo.delete({
      where: { chatId },
    });
  }

  private toDomainEntity(dbChat: any): ConversationEntity {
    return new ConversationEntity({
      chatId: dbChat.chatId,
      name: dbChat.groupInfo?.name,
      chatType: this.mapChatType(dbChat.chatMode),
      ownerOpenId: dbChat.groupInfo?.ownerOpenId,
      permissions: dbChat.permissionConfig as any,
      hasMainBot: dbChat.hasMainBot,
      hasDevBot: dbChat.hasDevBot,
      createdAt: dbChat.createdAt,
      updatedAt: dbChat.updatedAt,
    });
  }

  private mapChatType(chatMode: string): ChatType {
    switch (chatMode) {
      case 'p2p':
        return ChatType.P2P;
      case 'group':
        return ChatType.Group;
      case 'topic':
        return ChatType.Topic;
      default:
        return ChatType.Group;
    }
  }
}