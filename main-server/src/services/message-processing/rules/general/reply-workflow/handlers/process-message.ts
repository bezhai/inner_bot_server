import { generateChatResponse } from '../../../../ai/chat-service';
import { ReplyContext } from '../types';

export async function processMessageHandler(
  context: ReplyContext,
): Promise<void> {
  if (!context.cardManager || !context.contextMessages || !context.config) {
    throw new Error('Context not properly prepared');
  }

  try {
    await generateChatResponse(
      context.config.model,
      context.contextMessages,
      context.cardManager.createActionHandler(),
      context.config.prompt,
      context.config.params,
      context.cardManager.closeUpdate.bind(context.cardManager),
    );
  } catch (error) {
    console.error('回复消息时出错:', error);
    // Error will be handled by closeUpdate through endOfReply callback
  }
}
