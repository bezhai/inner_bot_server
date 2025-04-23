import { Message } from '../../../models/message';
import {
    TextContent,
    ImageContent,
    StickerContent,
    PostContent,
} from '../../../types/content-types';
import { LarkReceiveMessage } from '../../../types/lark';
import { ContentType, ContentItem, MessageContent } from '../../../models/message-content';
import { MentionUtils } from '../../../utils/mention-utils';

export class MessageTransferer {
    // 临时先将getContentFactory改为public, 方便调用, 后面看怎么封装起来
    static getContentFactory(message_type: string, content: string): MessageContentHandler {
        switch (message_type) {
            case 'text':
                return new TextMessageContentFactory(content);
            case 'image':
                return new ImageMessageContentFactory(content);
            case 'post':
                return new PostMessageContentFactory(content);
            case 'sticker':
                return new StickerMessageContentFactory(content);
            default:
                return new OtherMessageContentFactory(content);
        }
    }

    static async transfer(event: LarkReceiveMessage): Promise<Message | null> {
        const contentFactory = this.getContentFactory(
            event.message.message_type,
            event.message.content,
        );
        const items = contentFactory.generateContent();
        if (items.length === 0) {
            return null;
        }
        return Message.fromEvent(event, {
            items,
            mentions: MentionUtils.addMentions(event.message.mentions),
        });
    }
}

interface MessageContentHandler {
    generateContent(): ContentItem[];
}

abstract class BaseMessageContentFactory implements MessageContentHandler {
    protected content: string;

    constructor(content: string) {
        this.content = content;
    }

    abstract generateContent(): ContentItem[];
}

class TextMessageContentFactory extends BaseMessageContentFactory {
    generateContent(): ContentItem[] {
        try {
            const content: TextContent = JSON.parse(this.content);
            return [
                {
                    type: ContentType.Text,
                    value: content.text,
                },
            ];
        } catch (err) {
            console.error('Failed to parse text content:', err);
            return [];
        }
    }
}

class ImageMessageContentFactory extends BaseMessageContentFactory {
    generateContent(): ContentItem[] {
        try {
            const content: ImageContent = JSON.parse(this.content);
            return [
                {
                    type: ContentType.Image,
                    value: content.image_key,
                },
            ];
        } catch (err) {
            console.error('Failed to parse image content:', err);
            return [];
        }
    }
}

class StickerMessageContentFactory extends BaseMessageContentFactory {
    generateContent(): ContentItem[] {
        try {
            const content: StickerContent = JSON.parse(this.content);
            return [
                {
                    type: ContentType.Sticker,
                    value: content.file_key,
                },
            ];
        } catch (err) {
            console.error('Failed to parse sticker content:', err);
            return [];
        }
    }
}

class PostMessageContentFactory extends BaseMessageContentFactory {
    generateContent(): ContentItem[] {
        try {
            const content: PostContent = JSON.parse(this.content);
            const items: ContentItem[] = [];

            content.content.forEach((row) => {
                row.forEach((node) => {
                    if (node.tag === 'text' && node.text) {
                        items.push({
                            type: ContentType.Text,
                            value: node.text,
                        });
                    } else if (node.tag === 'img' && node.image_key) {
                        items.push({
                            type: ContentType.Image,
                            value: node.image_key,
                        });
                    }
                });
            });

            return items;
        } catch (err) {
            console.error('Failed to parse post content:', err);
            return [];
        }
    }
}

class OtherMessageContentFactory extends BaseMessageContentFactory {
    generateContent(): ContentItem[] {
        return [];
    }
}
