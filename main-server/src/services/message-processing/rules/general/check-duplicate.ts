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
        replyMessage(message.messageId, '赤尾不知道你要查重啥消息哦😴你需要回复一条消息w', true);
        return;
    }

    const storedMessage = await getMessage(message.parentMessageId);

    if (!storedMessage) {
        replyMessage(message.messageId, '赤尾找不到这条消息哦🥺', true);
        return;
    }

    const originalMessage = await Message.fromMessage(storedMessage);

    if (!originalMessage) {
        replyMessage(message.messageId, '赤尾发现这条消息似乎不太对劲哦😮', true);
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
                `查重赤尾启动！这条消息可能存在学术不端行为🚨🚨🚨！查重率: ${(result.similarity * 100).toFixed(2)}%`,
                false,
            );
            await replyMessage(
                result.message_id,
                `就是这条消息！`,
            );
        } else {
            replyMessage(originalMessage.messageId, '恭喜🎉🎉！赤尾觉得这条消息应该是原创的w', false);
        }
    } catch (error) {
        console.error('查重失败:', error);
        replyMessage(originalMessage.messageId, '查重失败，请稍后重试', true);
    }
}
