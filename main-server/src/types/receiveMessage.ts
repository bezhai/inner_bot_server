import { send } from "../dal/larkClient";
import { LarkMention, LarkMessage, LarkReceiveMessage } from "./lark";
import { LarkMessageMetaInfo } from "./mongo";

class BaseMessage {
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

  // 私有构造函数，强制使用工厂方法创建实例
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
  }

  static fromLarkEvent<T extends BaseMessage>(
    this: new (...args: any[]) => T,
    event: LarkReceiveMessage
  ): T {
    return new this({
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      sender: event.sender.sender_id?.union_id ?? "unknown_sender",
      parentMessageId: event.message.parent_id,
      mentions: BaseMessage.addMentions(event.message.mentions),
      chatType: event.message.chat_type,
      rootId: event.message.root_id || event.message.message_id,
      threadId: event.message.thread_id,
      isRobotMessage: false,
    });
  }

  protected static addMentions(mentions: LarkMention[] | undefined): string[] {
    console.log("mentions", mentions);
    return mentions ? mentions.map((m) => m.id.open_id!) : [];
  }

  isP2P(): boolean {
    return this.chatType === "p2p";
  }

  hasMention(openId: string): boolean {
    return this.mentions.includes(openId);
  }
}

enum ItemType {
  Text = 1,
  Photo = 2,
  Sticker = 3,
}

interface MessageItem {
  itemType: ItemType;
  text?: string;
  imageKey?: string;
  fileKey?: string;
}

export class CommonMessage extends BaseMessage {
  messageItems: MessageItem[] = [];

  addText(text: string): this {
    this.messageItems.push({ itemType: ItemType.Text, text });
    return this;
  }

  addImage(imageKey: string): this {
    this.messageItems.push({ itemType: ItemType.Photo, imageKey });
    return this;
  }

  addSticker(fileKey: string): this {
    this.messageItems.push({ itemType: ItemType.Sticker, fileKey });
    return this;
  }

  texts(): string[] {
    return this.messageItems
      .filter((item) => item.itemType === ItemType.Text)
      .map((item) => item.text ?? "");
  }

  sticker(): string {
    const stickerItem = this.messageItems.find(
      (item) => item.itemType === ItemType.Sticker
    );
    return stickerItem?.fileKey ?? "";
  }

  imageKeys(): string[] {
    return this.messageItems
      .filter((item) => item.itemType === ItemType.Photo)
      .map((item) => item.imageKey ?? "");
  }

  text(): string {
    return this.texts().join("");
  }

  withMentionText(): string {
    let text = this.text();
    this.mentions.forEach((mention, index) => {
      text = text.replace(
        `@_user_${index + 1}`,
        `<at union_id="${mention}"></at>`
      );
    });
    return text;
  }

  clearText(): string {
    let text = this.text();
    text = text
      .replace(/@_user_\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }

  withoutEmojiText(): string {
    let text = this.clearText();
    text = text.replace(/\[[^\]]+\]/g, "").replace(/<[^<>]+>/g, "");
    return text;
  }

  isTextMessage(): boolean {
    return this.imageKeys().length === 0 && this.texts().length > 0;
  }

  isStickerMessage(): boolean {
    return this.sticker().length > 0;
  }

  static fromMessage(message: LarkMessageMetaInfo): CommonMessage {

    if (message.is_from_robot) {
      const baseMessage = new CommonMessage({
        messageId: message.message_id,
        chatId: message.chat_id,
        sender: "robot",
        parentMessageId: message.parent_id,
        mentions: [],
        chatType: message.chat_type,
        rootId: message.root_id,
        threadId: message.thread_id,
        isRobotMessage: true,
      });
      baseMessage.addText(message.robot_text ?? "");
      return baseMessage;
    } else {
      const baseMessage = new CommonMessage({
        messageId: message.message_id,
        chatId: message.chat_id,
        sender: message.sender?? "unknown_sender",
        parentMessageId: message.parent_id,
        mentions: BaseMessage.addMentions(message.mentions),
        chatType: message.chat_type,
        rootId: message.root_id,
        threadId: message.thread_id,
        isRobotMessage: false,
      })
      const content = JSON.parse(message.message_content ?? "{}");
      baseMessage.addText(content.text ?? "");
      return baseMessage;
    }
  }
}

// 文本消息内容
export interface TextContent {
  text: string; // 文本内容，必填
}

// 图片消息内容
export interface ImageContent {
  image_key: string; // 图片的 key，必填
}

// 表情包消息内容
export interface StickerContent {
  file_key: string; // 表情包文件的 key，必填
}

export type TextPostNodeType = "bold" | "underline" | "lineThrough" | "italic";

export interface TextPostNode {
  tag: "text";
  text: string; // 文本内容
  un_escape?: boolean; // 是否 unescape 解码。默认为 false
  style?: TextPostNodeType[];
}

export interface LinkPostNode {
  tag: "a";
  text: string; // 超链接的文本内容
  href: string; // 超链接地址
  style?: TextPostNodeType[];
}

export interface AtPostNode {
  tag: "at";
  user_id: string; // 用户 ID，用来指定被 @ 的用户。传入的值可以是用户的 user_id、open_id、union_id
  style?: TextPostNodeType[];
}

export interface ImgPostNode {
  tag: "img";
  image_key: string; // 图片 Key
}

export interface MediaPostNode {
  tag: "media";
  file_key: string; // 视频 Key
  image_key: string; // 图片 Key
}

export interface MdPostNode {
  tag: "md";
  text: string; // 内容
}

export interface CodeBlockPostNode {
  tag: "code_block";
  language?: string; // 代码块的语言类型
  text: string; // 代码块内容
}

// 富文本消息中的每个节点
export type PostNode =
  | TextPostNode
  | ImgPostNode
  | LinkPostNode
  | AtPostNode
  | MediaPostNode
  | MediaPostNode
  | MdPostNode
  | CodeBlockPostNode;

// 富文本消息内容
export interface PostContent {
  title?: string; // 富文本消息的标题
  content: PostNode[][]; // 富文本消息的内容，二维数组
}

export type Content = TextContent | ImageContent | StickerContent | PostContent;
