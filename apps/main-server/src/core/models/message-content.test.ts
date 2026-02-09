import { ContentType, MessageContentUtils, MessageContent } from './message-content';

// Mock the bot-var module to avoid pulling in real dependencies
jest.mock('@core/services/bot/bot-var', () => ({
    getBotUnionId: jest.fn(() => 'bot_union_id'),
}));

describe('MessageContentUtils.toMarkdown', () => {
    const makeContent = (
        items: { type: ContentType; value: string; meta?: Record<string, unknown> }[],
    ): MessageContent => ({
        items,
        mentions: [],
    });

    it('should render text items', () => {
        const content = makeContent([{ type: ContentType.Text, value: 'hello' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('hello');
    });

    it('should render image items with download allowed', () => {
        const content = makeContent([{ type: ContentType.Image, value: 'img_key' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('![image](img_key)');
    });

    it('should render image items without download', () => {
        const content = makeContent([{ type: ContentType.Image, value: 'img_key' }]);
        expect(MessageContentUtils.toMarkdown(content, false)).toBe('[Non-downloadable Image]');
    });

    it('should render sticker items', () => {
        const content = makeContent([{ type: ContentType.Sticker, value: 'sticker_key' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[表情包]');
    });

    it('should render media items with file_name', () => {
        const content = makeContent([
            { type: ContentType.Media, value: 'file_key', meta: { file_name: 'video.mp4' } },
        ]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[视频: video.mp4]');
    });

    it('should render media items without file_name', () => {
        const content = makeContent([{ type: ContentType.Media, value: 'file_key' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[视频]');
    });

    it('should render file items with file_name', () => {
        const content = makeContent([
            { type: ContentType.File, value: 'file_key', meta: { file_name: 'doc.pdf' } },
        ]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[文件: doc.pdf]');
    });

    it('should render file items without file_name', () => {
        const content = makeContent([{ type: ContentType.File, value: 'file_key' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[文件]');
    });

    it('should render audio items', () => {
        const content = makeContent([{ type: ContentType.Audio, value: 'audio_key' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[语音]');
    });

    it('should render unsupported items as their value', () => {
        const content = makeContent([{ type: ContentType.Unsupported, value: '[合并转发]' }]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe('[合并转发]');
    });

    it('should concatenate mixed content types', () => {
        const content = makeContent([
            { type: ContentType.Text, value: 'look at this: ' },
            { type: ContentType.Image, value: 'img_key' },
            { type: ContentType.Text, value: ' and ' },
            { type: ContentType.Media, value: 'v_key', meta: { file_name: 'clip.mp4' } },
        ]);
        expect(MessageContentUtils.toMarkdown(content, true)).toBe(
            'look at this: ![image](img_key) and [视频: clip.mp4]',
        );
    });
});

describe('MessageContentUtils filter methods with new types', () => {
    const makeContent = (
        items: { type: ContentType; value: string; meta?: Record<string, unknown> }[],
    ): MessageContent => ({
        items,
        mentions: [],
    });

    it('texts() should only return text items', () => {
        const content = makeContent([
            { type: ContentType.Text, value: 'hello' },
            { type: ContentType.Media, value: 'video_key' },
            { type: ContentType.Text, value: 'world' },
        ]);
        expect(MessageContentUtils.texts(content)).toEqual(['hello', 'world']);
    });

    it('imageKeys() should only return image items', () => {
        const content = makeContent([
            { type: ContentType.Image, value: 'img1' },
            { type: ContentType.File, value: 'file1' },
            { type: ContentType.Image, value: 'img2' },
        ]);
        expect(MessageContentUtils.imageKeys(content)).toEqual(['img1', 'img2']);
    });

    it('isTextOnly() should return false for non-text types', () => {
        const content = makeContent([
            { type: ContentType.Text, value: 'hello' },
            { type: ContentType.Media, value: 'video' },
        ]);
        expect(MessageContentUtils.isTextOnly(content)).toBe(false);
    });

    it('isStickerOnly() should return false for media items', () => {
        const content = makeContent([{ type: ContentType.Media, value: 'video' }]);
        expect(MessageContentUtils.isStickerOnly(content)).toBe(false);
    });
});
