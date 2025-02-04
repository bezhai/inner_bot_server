import { MentionUtils } from '../utils/mention-utils';
import { LarkBaseChatInfo, LarkGroupChatInfo, LarkUser } from '../dal/entities';
import { BaseChatInfoRepository, GroupChatInfoRepository, UserRepository } from '../dal/repositories/repositories';
import { LarkReceiveMessage } from '../types/lark';

export class BaseMessage {
  rootId?: string;
  threadId?: string;
  messageId: string;
  chatId: string;
  sender: string;
  senderName?: string;
  parentMessageId?: string;
  mentions: string[];
  chatType: string;
  isRobotMessage: boolean;
  basicChatInfo?: LarkBaseChatInfo;
  groupChatInfo?: LarkGroupChatInfo;
  senderInfo?: LarkUser;
  createTime?: string; // 毫秒时间戳

  constructor(init: {
    rootId?: string;
    threadId?: string;
    messageId: string;
    chatId: string;
    sender: string;
    parentMessageId?: string;
    mentions: string[];
    chatType: string;
    isRobotMessage: boolean;
    senderName?: string;
    basicChatInfo?: LarkBaseChatInfo;
    groupChatInfo?: LarkGroupChatInfo;
    senderInfo?: LarkUser;
  }) {
    this.rootId = init.rootId;
    this.threadId = init.threadId;
    this.messageId = init.messageId;
    this.chatId = init.chatId;
    this.sender = init.sender;
    this.parentMessageId = init.parentMessageId;
    this.mentions = init.mentions;
    this.chatType = init.chatType;
    this.isRobotMessage = init.isRobotMessage;
    this.senderName = init.senderName;
    this.basicChatInfo = init.basicChatInfo;
    this.groupChatInfo = init.groupChatInfo;
    this.senderInfo = init.senderInfo;
  }

  static async fromLarkEvent<T extends BaseMessage>(
    this: new (...args: any[]) => T,
    event: LarkReceiveMessage,
  ): Promise<T> {
    const basicChatInfoPromise =
      event.message.chat_type === 'p2p'
        ? BaseChatInfoRepository.findOne({
            where: { chat_id: event.message.chat_id },
          })
        : null;

    const groupChatInfoPromise =
      event.message.chat_type !== 'p2p'
        ? GroupChatInfoRepository.findOne({
            where: { chat_id: event.message.chat_id },
            relations: ['baseChatInfo'],
          })
        : null;

    const senderInfoPromise = event.sender.sender_id?.union_id
      ? UserRepository.findOne({
          where: { union_id: event.sender.sender_id.union_id },
        })
      : null;

    const [basicChatInfo, groupChatInfo, senderInfo] = await Promise.all([
      basicChatInfoPromise,
      groupChatInfoPromise,
      senderInfoPromise,
    ]);

    const finalBasicChatInfo =
      event.message.chat_type !== 'p2p' ? (groupChatInfo?.baseChatInfo ?? null) : basicChatInfo;

    return new this({
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      sender: event.sender.sender_id?.union_id ?? 'unknown_sender',
      parentMessageId: event.message.parent_id,
      mentions: MentionUtils.addMentions(event.message.mentions),
      chatType: event.message.chat_type,
      rootId: event.message.root_id || event.message.message_id,
      threadId: event.message.thread_id,
      isRobotMessage: false,
      basicChatInfo: finalBasicChatInfo,
      groupChatInfo,
      senderInfo,
    });
  }

  isP2P(): boolean {
    return this.chatType === 'p2p';
  }

  hasMention(openId: string): boolean {
    return this.mentions.includes(openId);
  }
}
