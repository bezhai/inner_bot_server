import { PostContent } from 'types/content-types';
import { PostNode, MdPostNode, EmotionNode } from 'types/post-node-types';
import { emojiService } from 'services/emoji-service';

/**
 * 从文本中提取形如 [xxx] 的子串
 */
function extractEmojiTexts(text: string): string[] {
    const regex = /\[([^\]]+)\]/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }

    return matches;
}

/**
 * 将文本转换为 PostContent，支持 emoji 表情
 */
export async function createPostContentFromText(text: string): Promise<PostContent> {
    // 提取所有形如 [xxx] 的子串
    const emojiTexts = extractEmojiTexts(text);

    if (emojiTexts.length === 0) {
        // 如果没有 emoji，直接返回纯文本
        return {
            content: [[{
                tag: 'md',
                text: text
            } as MdPostNode]]
        };
    }

    // 批量查询 emoji 数据
    const emojis = await emojiService.getEmojiByText(emojiTexts);

    // 创建 emoji 文本到 key 的映射
    const emojiMap = new Map<string, string>();
    emojis.forEach(emoji => {
        emojiMap.set(emoji.text, emoji.key);
    });

    // 分割文本
    const content: PostNode[] = [];
    let lastIndex = 0;
    const regex = /\[([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const emojiText = match[1];
        const emojiKey = emojiMap.get(emojiText);

        // 添加前面的文本（如果有）
        if (match.index > lastIndex) {
            const textBefore = text.substring(lastIndex, match.index);
            if (textBefore.trim()) {
                content.push({
                    tag: 'md',
                    text: textBefore
                } as MdPostNode);
            }
        }

        // 添加 emoji（如果找到对应的 key）
        if (emojiKey) {
            content.push({
                tag: 'emotion',
                emoji_type: emojiKey
            } as EmotionNode);
        } else {
            // 如果没找到对应的 emoji，将 [xxx] 当作普通文本处理
            content.push({
                tag: 'md',
                text: `[${emojiText}]`
            } as MdPostNode);
        }

        lastIndex = match.index + match[0].length;
    }

    // 添加最后的文本（如果有）
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        if (remainingText.trim()) {
            content.push({
                tag: 'md',
                text: remainingText
            } as MdPostNode);
        }
    }

    // 如果没有任何内容，返回空文本
    if (content.length === 0) {
        return {
            content: [[{
                tag: 'md',
                text: text
            } as MdPostNode]]
        };
    }

    return { content: [content] };
}
