import { LarkMessage, LarkReceiveMessage } from "./lark";

class BaseMessage {
  messageId: string;
  chatId: string;
  sender: string;
  parentMessageId?: string;
  mentions: string[];
  chatType: string;

  constructor(event: LarkReceiveMessage) {
    this.messageId = event.message.message_id;
    this.chatId = event.message.chat_id;
    this.sender = event.sender.sender_id?.user_id!;
    this.parentMessageId = event.message.parent_id;
    this.mentions = this.addMentions(event.message);
    this.chatType = event.message.chat_type;
  }

  private addMentions(message: LarkMessage): string[] {
    return message.mentions ? message.mentions.map((m) => m.id.open_id!) : [];
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
        `<at user_id="${mention}"></at>`
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

// 富文本消息中的每个节点
export interface PostNode {
  tag: string; // 节点类型，如文本、链接、at等
  text?: string; // 文本内容
  href?: string; // 链接
  user_id?: string; // @用户的ID
  user_name?: string; // @用户的名字
}

// 富文本消息内容
export interface PostContent {
  title: string; // 富文本消息的标题
  content: PostNode[][]; // 富文本消息的内容，二维数组
}

export type Content = TextContent | ImageContent | StickerContent | PostContent;
