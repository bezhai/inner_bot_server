import { CompletionRequest } from '../../../types/ai';
import { CommonMessage } from '../../../models/common-message';
import { processChatCompletion } from './chat-completion';
import { formatMessages } from './message-formatter';
import { ActionHandler, EndOfReplyHandler } from './stream/types';

export interface ChatResponseOptions {
  model: string;
  messages: CommonMessage[];
  handleAction: ActionHandler;
  systemPrompt?: string;
  chatParams?: Partial<CompletionRequest>;
  endOfReply?: EndOfReplyHandler;
}

export async function generateChatResponse(options: ChatResponseOptions) {
  const formattedMessages = formatMessages(options.messages, options.systemPrompt);

  await processChatCompletion({
    payload: {
      model: options.model,
      messages: formattedMessages,
      stream: true,
      ...options.chatParams,
    },
    handleAction: options.handleAction,
    endOfReply: options.endOfReply,
  });
}
