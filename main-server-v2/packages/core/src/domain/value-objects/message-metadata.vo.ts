export class MessageMetadata {
  readonly messageId: string;
  readonly rootId?: string;
  readonly parentMessageId?: string;
  readonly threadId?: string;
  readonly chatId: string;
  readonly senderId: string;
  readonly senderOpenId?: string;
  readonly senderName?: string;
  readonly chatType: string;
  readonly isRobotMessage: boolean;
  readonly createTime?: Date;

  constructor(params: {
    messageId: string;
    rootId?: string;
    parentMessageId?: string;
    threadId?: string;
    chatId: string;
    senderId: string;
    senderOpenId?: string;
    senderName?: string;
    chatType: string;
    isRobotMessage?: boolean;
    createTime?: Date | string;
  }) {
    this.messageId = params.messageId;
    this.rootId = params.rootId;
    this.parentMessageId = params.parentMessageId;
    this.threadId = params.threadId;
    this.chatId = params.chatId;
    this.senderId = params.senderId;
    this.senderOpenId = params.senderOpenId;
    this.senderName = params.senderName;
    this.chatType = params.chatType;
    this.isRobotMessage = params.isRobotMessage ?? false;
    
    if (params.createTime) {
      this.createTime = typeof params.createTime === 'string' 
        ? new Date(parseInt(params.createTime) * 1000) // Lark timestamp is in seconds
        : params.createTime;
    }
  }

  isP2P(): boolean {
    return this.chatType === 'p2p';
  }

  isGroup(): boolean {
    return this.chatType === 'group';
  }

  isTopic(): boolean {
    return this.chatType === 'topic';
  }

  isInThread(): boolean {
    return !!this.threadId || !!this.parentMessageId;
  }

  isThreadRoot(): boolean {
    return !!this.rootId && this.rootId === this.messageId;
  }

  // Serialization
  toJSON() {
    return {
      messageId: this.messageId,
      rootId: this.rootId,
      parentMessageId: this.parentMessageId,
      threadId: this.threadId,
      chatId: this.chatId,
      senderId: this.senderId,
      senderOpenId: this.senderOpenId,
      senderName: this.senderName,
      chatType: this.chatType,
      isRobotMessage: this.isRobotMessage,
      createTime: this.createTime,
    };
  }
}