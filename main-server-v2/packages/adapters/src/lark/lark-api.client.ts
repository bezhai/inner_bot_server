import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as lark from '@larksuiteoapi/node-sdk';
import { Retry } from '@main-server-v2/shared';

export interface SendMessageRequest {
  receiveId: string;
  messageType: 'text' | 'post' | 'image' | 'interactive';
  content: string;
  replyMessageId?: string;
}

export interface SendMessageResponse {
  messageId: string;
  rootId?: string;
  parentId?: string;
  msgType: string;
  createTime: string;
  updateTime: string;
  deleted: boolean;
  chatId: string;
  senderId: string;
  body: any;
}

export interface GetUserInfoRequest {
  userIdType: 'open_id' | 'union_id' | 'user_id';
  userId: string;
}

export interface UserInfo {
  unionId: string;
  userId?: string;
  openId: string;
  name: string;
  enName?: string;
  nickname?: string;
  email?: string;
  mobile?: string;
  avatar?: {
    avatar72?: string;
    avatar240?: string;
    avatar360?: string;
    avatar480?: string;
    avatar640?: string;
  };
  status?: {
    isFrozen?: boolean;
    isResigned?: boolean;
    isActivated?: boolean;
  };
  departmentIds?: string[];
}

export interface GetChatInfoRequest {
  chatId: string;
}

export interface ChatInfo {
  chatId: string;
  name?: string;
  description?: string;
  ownerId?: string;
  ownerIdType?: string;
  chatMode?: 'p2p' | 'group';
  chatType?: 'private' | 'public';
  chatTag?: string;
  external?: boolean;
  tenantKey?: string;
  joinMessageVisibility?: string;
  leaveMessageVisibility?: string;
  membershipApproval?: string;
  moderationPermission?: string;
  urgent?: boolean;
  videoConference?: boolean;
  hideGroupChat?: boolean;
}

export interface BatchGetUserInfoRequest {
  userIds: string[];
  userIdType: 'open_id' | 'union_id' | 'user_id';
}

export interface UpdateChatInfoRequest {
  chatId: string;
  name?: string;
  description?: string;
  addMemberPermission?: string;
  shareCardPermission?: string;
  atAllPermission?: string;
  editPermission?: string;
}

@Injectable()
export class LarkApiClient {
  private readonly logger = new Logger(LarkApiClient.name);
  private client: lark.Client;

  constructor(private readonly configService: ConfigService) {
    const appId = this.configService.get<string>('lark.appId');
    const appSecret = this.configService.get<string>('lark.appSecret');

    if (!appId || !appSecret) {
      throw new Error('Lark app credentials not configured');
    }

    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuilt,
      domain: lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.error,
    });

    this.logger.log('Lark API client initialized');
  }

  /**
   * Send a message to a user or chat
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const response = await this.client.im.message.create({
        data: {
          receive_id: request.receiveId,
          msg_type: request.messageType,
          content: request.content,
        },
        params: {
          receive_id_type: request.receiveId.startsWith('oc_') ? 'chat_id' : 'open_id',
        },
      });

      if (!response.data?.message_id) {
        throw new Error('Failed to send message: no message ID returned');
      }

      return {
        messageId: response.data.message_id,
        rootId: response.data.root_id,
        parentId: response.data.parent_id,
        msgType: response.data.msg_type,
        createTime: response.data.create_time,
        updateTime: response.data.update_time,
        deleted: response.data.deleted || false,
        chatId: response.data.chat_id,
        senderId: response.data.sender.id,
        body: response.data.body,
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Reply to a message
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async replyMessage(messageId: string, content: string, messageType: 'text' | 'post' = 'text'): Promise<SendMessageResponse> {
    try {
      const response = await this.client.im.message.reply({
        path: {
          message_id: messageId,
        },
        data: {
          content,
          msg_type: messageType,
        },
      });

      if (!response.data?.message_id) {
        throw new Error('Failed to reply to message: no message ID returned');
      }

      return {
        messageId: response.data.message_id,
        rootId: response.data.root_id,
        parentId: response.data.parent_id,
        msgType: response.data.msg_type,
        createTime: response.data.create_time,
        updateTime: response.data.update_time,
        deleted: response.data.deleted || false,
        chatId: response.data.chat_id,
        senderId: response.data.sender.id,
        body: response.data.body,
      };
    } catch (error) {
      this.logger.error(`Failed to reply to message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user information
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async getUserInfo(request: GetUserInfoRequest): Promise<UserInfo> {
    try {
      const response = await this.client.contact.user.get({
        path: {
          user_id: request.userId,
        },
        params: {
          user_id_type: request.userIdType,
        },
      });

      if (!response.data?.user) {
        throw new Error(`User not found: ${request.userId}`);
      }

      const user = response.data.user;
      return {
        unionId: user.union_id,
        userId: user.user_id,
        openId: user.open_id,
        name: user.name,
        enName: user.en_name,
        nickname: user.nickname,
        email: user.email,
        mobile: user.mobile,
        avatar: user.avatar,
        status: user.status,
        departmentIds: user.department_ids,
      };
    } catch (error) {
      this.logger.error(`Failed to get user info: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Batch get user information
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async batchGetUserInfo(request: BatchGetUserInfoRequest): Promise<UserInfo[]> {
    try {
      const response = await this.client.contact.user.batchGet({
        params: {
          user_ids: request.userIds,
          user_id_type: request.userIdType,
        },
      });

      if (!response.data?.items) {
        return [];
      }

      return response.data.items.map((user) => ({
        unionId: user.union_id,
        userId: user.user_id,
        openId: user.open_id,
        name: user.name,
        enName: user.en_name,
        nickname: user.nickname,
        email: user.email,
        mobile: user.mobile,
        avatar: user.avatar,
        status: user.status,
        departmentIds: user.department_ids,
      }));
    } catch (error) {
      this.logger.error(`Failed to batch get user info: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get chat information
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async getChatInfo(request: GetChatInfoRequest): Promise<ChatInfo> {
    try {
      const response = await this.client.im.chat.get({
        path: {
          chat_id: request.chatId,
        },
      });

      if (!response.data) {
        throw new Error(`Chat not found: ${request.chatId}`);
      }

      const chat = response.data;
      return {
        chatId: chat.chat_id,
        name: chat.name,
        description: chat.description,
        ownerId: chat.owner_id,
        ownerIdType: chat.owner_id_type,
        chatMode: chat.chat_mode as 'p2p' | 'group',
        chatType: chat.chat_type as 'private' | 'public',
        chatTag: chat.chat_tag,
        external: chat.external,
        tenantKey: chat.tenant_key,
        joinMessageVisibility: chat.join_message_visibility,
        leaveMessageVisibility: chat.leave_message_visibility,
        membershipApproval: chat.membership_approval,
        moderationPermission: chat.moderation_permission,
        urgent: chat.urgent,
        videoConference: chat.video_conference,
        hideGroupChat: chat.hide_group_chat,
      };
    } catch (error) {
      this.logger.error(`Failed to get chat info: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update chat information
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async updateChatInfo(request: UpdateChatInfoRequest): Promise<void> {
    try {
      await this.client.im.chat.update({
        path: {
          chat_id: request.chatId,
        },
        data: {
          name: request.name,
          description: request.description,
          add_member_permission: request.addMemberPermission,
          share_card_permission: request.shareCardPermission,
          at_all_permission: request.atAllPermission,
          edit_permission: request.editPermission,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update chat info: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get members of a chat
   */
  @Retry({ maxAttempts: 3, backoffMs: 1000, exponential: true })
  async getChatMembers(chatId: string, pageSize: number = 100, pageToken?: string): Promise<{
    members: Array<{ memberId: string; memberIdType: string; name: string; tenantKey: string }>;
    hasMore: boolean;
    pageToken?: string;
  }> {
    try {
      const response = await this.client.im.chatMembers.get({
        path: {
          chat_id: chatId,
        },
        params: {
          member_id_type: 'open_id',
          page_size: pageSize,
          page_token: pageToken,
        },
      });

      return {
        members: response.data?.items || [],
        hasMore: response.data?.has_more || false,
        pageToken: response.data?.page_token,
      };
    } catch (error) {
      this.logger.error(`Failed to get chat members: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if bot is in a chat
   */
  async isBotInChat(chatId: string): Promise<boolean> {
    try {
      const response = await this.client.im.chatMembers.isInChat({
        path: {
          chat_id: chatId,
        },
      });

      return response.data?.is_in_chat || false;
    } catch (error) {
      this.logger.error(`Failed to check bot membership: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Upload image
   */
  async uploadImage(imageData: Buffer, fileName: string): Promise<string> {
    try {
      const response = await this.client.im.image.create({
        data: {
          image_type: 'message',
          image: imageData,
        },
      });

      if (!response.data?.image_key) {
        throw new Error('Failed to upload image: no image key returned');
      }

      return response.data.image_key;
    } catch (error) {
      this.logger.error(`Failed to upload image: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create an interactive card message
   */
  createInteractiveCard(config: any): string {
    // This is a simplified version - in reality, you'd build a proper card structure
    return JSON.stringify({
      config,
      header: config.header,
      elements: config.elements || [],
    });
  }

  /**
   * Get the underlying Lark SDK client for advanced operations
   */
  getClient(): lark.Client {
    return this.client;
  }
}