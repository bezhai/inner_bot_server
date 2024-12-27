import { BaseMessage } from "./base-message";
import { TextUtils } from "../utils/text-utils";
import { MentionUtils } from "../utils/mention-utils";
import { LarkMessageMetaInfo } from "../types/mongo";

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

  clearText(): string {
    return TextUtils.clearText(this.text());
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

  withoutEmojiText(): string {
    return TextUtils.removeEmoji(this.clearText());
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
        sender: message.sender ?? "unknown_sender",
        parentMessageId: message.parent_id,
        mentions: MentionUtils.addMentions(message.mentions),
        chatType: message.chat_type,
        rootId: message.root_id,
        threadId: message.thread_id,
        isRobotMessage: false,
      });
      const content = JSON.parse(message.message_content ?? "{}");
      baseMessage.addText(content.text ?? "");
      return baseMessage;
    }
  }
}
