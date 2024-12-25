import { LarkReceiveMessage } from "../../types/lark";
import {
  CommonMessage,
  ImageContent,
  PostContent,
  StickerContent,
  TextContent,
} from "../../types/receiveMessage";

export class MessageFactory {
  static create(event: LarkReceiveMessage): MessageHandler {
    switch (event.message.message_type) {
      case "text":
        return new TextMessageFactory(event);
      case "image":
        return new ImageMessageFactory(event);
      case "post":
        return new PostMessageFactory(event);
      case "sticker":
        return new StickerMessageFactory(event);
      default:
        return new OtherMessageFactory(event);
    }
  }
}

interface MessageHandler {
  build(): Promise<CommonMessage | null>;
}

class TextMessageFactory implements MessageHandler {
  event: LarkReceiveMessage;

  constructor(event: LarkReceiveMessage) {
    this.event = event;
  }

  async build(): Promise<CommonMessage | null> {
    const msg = await CommonMessage.fromLarkEvent(this.event);
    try {
      const content: TextContent = JSON.parse(this.event.message.content);
      msg.addText(content.text);
    } catch (err) {
      console.error("Failed to parse text content:", err);
      return null;
    }
    return msg;
  }
}

class ImageMessageFactory implements MessageHandler {
  event: LarkReceiveMessage;

  constructor(event: LarkReceiveMessage) {
    this.event = event;
  }

  async build(): Promise<CommonMessage | null> {
    const msg = await CommonMessage.fromLarkEvent(this.event);
    try {
      const content: ImageContent = JSON.parse(this.event.message.content);
      msg.addImage(content.image_key);
    } catch (err) {
      console.error("Failed to parse image content:", err);
      return null;
    }
    return msg;
  }
}

class StickerMessageFactory implements MessageHandler {
  event: LarkReceiveMessage;

  constructor(event: LarkReceiveMessage) {
    this.event = event;
  }

  async build(): Promise<CommonMessage | null> {
    const msg = await CommonMessage.fromLarkEvent(this.event);
    try {
      const content: StickerContent = JSON.parse(this.event.message.content);
      msg.addSticker(content.file_key);
    } catch (err) {
      console.error("Failed to parse sticker content:", err);
      return null;
    }
    return msg;
  }
}

class PostMessageFactory implements MessageHandler {
  event: LarkReceiveMessage;

  constructor(event: LarkReceiveMessage) {
    this.event = event;
  }

  async build(): Promise<CommonMessage | null> {
    const msg = await CommonMessage.fromLarkEvent(this.event);
    try {
      const content: PostContent = JSON.parse(this.event.message.content);
      content.content.forEach((row) => {
        row.forEach((node) => {
          if (node.tag === "text") {
            msg.addText(node.text ?? "");
          } else if (node.tag === "img") {
            msg.addImage(node.image_key ?? "");
          }
        });
      });
    } catch (err) {
      console.error("Failed to parse post content:", err);
      return null;
    }
    return msg;
  }
}

class OtherMessageFactory implements MessageHandler {
  event: LarkReceiveMessage;

  constructor(event: LarkReceiveMessage) {
    this.event = event;
  }

  async build(): Promise<CommonMessage | null> {
    return null;
  }
}
