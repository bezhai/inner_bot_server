import { Message } from '../../../../models/message';
import { replyMessage } from '../../../lark/basic/message';
import { publishEventAndWait } from '../../../../events';
import { getMessage } from '../../../message-store/basic';

interface FindSimilarMessageResponse {
    found: boolean;
    message_id?: string;
    similarity?: number;
}

export async function checkDuplicate(message: Message) {
    if (!message.parentMessageId) {
        replyMessage(
            message.messageId,
            '呜呜~需要查重的话，要回复一条消息给人家看看呢😴 (｡ᵕ ᵕ｡)',
            true,
        );
        return;
    }

    const storedMessage = await getMessage(message.parentMessageId);

    if (!storedMessage) {
        replyMessage(message.messageId, '呜哇...人家翻遍了记忆也找不到这条消息呢🥺 (｡•́︿•̀｡)', true);
        return;
    }

    const originalMessage = await Message.fromMessage(storedMessage);

    if (!originalMessage) {
        replyMessage(message.messageId, '诶嘿~这条消息看起来怪怪的呢😮 (。>﹏<。)', true);
        return;
    }

    try {
        // 发布查重事件并等待结果
        const result = (await publishEventAndWait('find.similar.message', {
            messageId: originalMessage.messageId,
            chatId: originalMessage.chatId,
            message_context: originalMessage.clearText(),
            similarity_threshold: 0.8,
        })) as FindSimilarMessageResponse;

        if (result.found && result.similarity && result.message_id) {
            // 回复两次消息, 第一次是查重结果, 第二次是回复原消息
            await replyMessage(
                originalMessage.messageId,
                `哼哼！赤尾的查重雷达启动！(｀･ω･´)ゞ 这条消息可能有点小问题呢🚨！相似度高达: ${(result.similarity * 100).toFixed(2)}% (｡•ˇ‸ˇ•｡)`,
                false,
            );
            await replyMessage(result.message_id, `锵锵~就是这条消息啦！(｀・ω・´)`);
        } else {
            replyMessage(
                originalMessage.messageId,
                '太好啦！赤尾觉得这是原创内容呢🎉！真是太棒啦 (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
                false,
            );
        }
    } catch (error) {
        console.error('查重失败:', error);
        replyMessage(
            originalMessage.messageId,
            '呜呜...查重的时候出了点小问题呢 (´;ω;｀) 可以稍后再试试吗？',
            true,
        );
    }
}
