export enum ContentType {
  Text = 'text',
  Image = 'image',
  Sticker = 'sticker',
}

export interface ContentItem {
  type: ContentType;
  value: string;
}

export interface MentionInfo {
  name: string;
  openId: string;
}

export class MessageContent {
  private readonly items: ContentItem[];
  readonly mentions: string[];
  private readonly mentionMap?: Record<string, MentionInfo>;

  constructor(params: {
    items: ContentItem[];
    mentions?: string[];
    mentionMap?: Record<string, MentionInfo>;
  }) {
    this.items = params.items;
    this.mentions = params.mentions ?? [];
    this.mentionMap = params.mentionMap;
  }

  // Text operations
  texts(): string[] {
    return this.items
      .filter((item) => item.type === ContentType.Text)
      .map((item) => item.value);
  }

  fullText(): string {
    return this.texts().join('');
  }

  clearText(): string {
    return this.fullText()
      .replace(/\s+/g, ' ')
      .trim();
  }

  withoutEmojiText(): string {
    // Remove emoji characters
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return this.clearText().replace(emojiRegex, '').trim();
  }

  withMentionText(): string {
    let text = this.fullText();
    this.mentions.forEach((mention, index) => {
      text = text.replace(`@_user_${index + 1}`, `<at user_id="${mention}"></at>`);
    });
    return text;
  }

  // Image operations
  imageKeys(): string[] {
    return this.items
      .filter((item) => item.type === ContentType.Image)
      .map((item) => item.value);
  }

  hasImages(): boolean {
    return this.imageKeys().length > 0;
  }

  // Sticker operations
  stickerKey(): string {
    const stickerItem = this.items.find((item) => item.type === ContentType.Sticker);
    return stickerItem?.value ?? '';
  }

  hasSticker(): boolean {
    return this.stickerKey() !== '';
  }

  // Content type checks
  isTextOnly(): boolean {
    return this.items.length > 0 && this.items.every((item) => item.type === ContentType.Text);
  }

  isStickerOnly(): boolean {
    return this.items.length === 1 && this.items[0].type === ContentType.Sticker;
  }

  isImageOnly(): boolean {
    return this.items.length > 0 && this.items.every((item) => item.type === ContentType.Image);
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  // Mention operations
  hasMention(userId: string): boolean {
    return this.mentions.includes(userId);
  }

  getMentionNames(): string[] {
    if (!this.mentionMap) return [];
    return Object.values(this.mentionMap).map(info => info.name);
  }

  // Markdown conversion
  toMarkdown(): string {
    let markdown = this.items
      .map((item) => {
        switch (item.type) {
          case ContentType.Text:
            return item.value;
          case ContentType.Image:
            return `![image](${item.value})`;
          case ContentType.Sticker:
            return `[sticker:${item.value}]`;
          default:
            return '';
        }
      })
      .join('');

    // Replace mention placeholders with actual names
    if (this.mentionMap) {
      this.mentions.forEach((mention, index) => {
        const mentionInfo = this.mentionMap[mention];
        if (mentionInfo) {
          markdown = markdown.replace(`@_user_${index + 1}`, `@${mentionInfo.name}`);
        }
      });
    }

    return markdown;
  }

  // Serialization
  toJSON() {
    return {
      items: this.items,
      mentions: this.mentions,
      mentionMap: this.mentionMap,
    };
  }

  // Factory methods
  static fromText(text: string): MessageContent {
    return new MessageContent({
      items: [{ type: ContentType.Text, value: text }],
    });
  }

  static fromImage(imageKey: string): MessageContent {
    return new MessageContent({
      items: [{ type: ContentType.Image, value: imageKey }],
    });
  }

  static fromSticker(stickerKey: string): MessageContent {
    return new MessageContent({
      items: [{ type: ContentType.Sticker, value: stickerKey }],
    });
  }

  static empty(): MessageContent {
    return new MessageContent({ items: [] });
  }
}