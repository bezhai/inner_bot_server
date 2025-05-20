import { generateChatResponse } from '../../../../ai/chat-service';
import { ReplyContext } from '../types';

export async function processMessageHandler(context: ReplyContext): Promise<void> {
    if (!context.cardManager || !context.contextMessages || !context.config) {
        throw new Error('Context not properly prepared');
    }

    try {
        await generateChatResponse({
            model: context.config.model,
            messages: context.contextMessages,
            handleAction: context.cardManager.createActionHandler(),
            systemPrompt: context.config.prompt,
            chatParams: context.config.params,
            endOfReply: context.cardManager.closeUpdate.bind(context.cardManager),
            enableWebSearch: context.config.enableWebSearch,
        });
    } catch (error) {
        console.error('回复消息时出错:', error);
        // Error will be handled by closeUpdate through endOfReply callback
    }
}
