import { TextUtils } from 'utils/text/text-utils';
import { getBotUnionId } from 'utils/bot/bot-var';

export enum ContentType {
    Text = 'text',
    Image = 'image',
    Sticker = 'sticker',
}

export interface ContentItem {
    type: ContentType;
    value: string;
}

export interface MessageContent {
    items: ContentItem[];
    mentions: string[];
    mentionMap?: Record<
        string,
        {
            name: string;
            openId: string;
        }
    >;
}

export class MessageContentUtils {
    static toMarkdown(content: MessageContent, allowDownload: boolean): string {
        let markdown = content.items
            .map((item) => {
                if (item.type === ContentType.Text) {
                    return item.value;
                }
                if (item.type === ContentType.Image) {
                    if (!allowDownload) {
                        return '[Non-downloadable Image]';
                    }
                    return `![image](${item.value})`;
                }
                if (item.type === ContentType.Sticker) {
                    return `[表情包]`;
                }
            })
            .join('');

        content.mentions.forEach((mention, index) => {
            const mentionInfo = content.mentionMap?.[mention]!;
            const botUnionId = getBotUnionId();
            const displayName = mention === botUnionId ? '赤尾' : mentionInfo.name;
            markdown = markdown.replace(`@_user_${index + 1}`, `@${displayName}`);
        });

        return markdown;
    }

    static texts(content: MessageContent): string[] { 
        return content.items
            .filter((item) => item.type === ContentType.Text)
            .map((item) => item.value);
    }

    static imageKeys(content: MessageContent): string[] {
        return content.items
            .filter((item) => item.type === ContentType.Image)
            .map((item) => item.value);
    }

    static stickerKey(content: MessageContent): string {
        const stickerItem = content.items.find((item) => item.type === ContentType.Sticker);
        return stickerItem?.value ?? '';
    }

    static fullText(content: MessageContent): string {
        return this.texts(content).join('');
    }

    static clearText(content: MessageContent): string {
        return TextUtils.clearText(this.fullText(content));
    }

    static withoutEmojiText(content: MessageContent): string {
        return TextUtils.removeEmoji(this.clearText(content));
    }

    static withMentionText(content: MessageContent): string {
        let text = this.fullText(content);
        content.mentions.forEach((mention, index) => {
            text = text.replace(`@_user_${index + 1}`, `<at user_id="${mention}"></at>`);
        });
        return text;
    }

    static isTextOnly(content: MessageContent): boolean {
        return content.items.every((item) => item.type === ContentType.Text);
    }

    static isStickerOnly(content: MessageContent): boolean {
        return content.items.length === 1 && content.items[0].type === ContentType.Sticker;
    }
}
