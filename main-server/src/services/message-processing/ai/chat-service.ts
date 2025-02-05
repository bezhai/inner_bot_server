import { CompletionRequest } from '../../../types/ai';
import { Message } from '../../../models/message';
import { processChatCompletion } from './chat-completion';
import { formatMessages, uploadMessageImages } from './message-formatter';
import { ActionHandler, EndOfReplyHandler } from './stream/types';

export interface ChatResponseOptions {
  model: string;
  messages: Message[];
  handleAction: ActionHandler;
  systemPrompt?: string;
  chatParams?: Partial<CompletionRequest>;
  endOfReply?: EndOfReplyHandler;
}

export async function generateChatResponse(options: ChatResponseOptions) {
  const imageKeyMap = await uploadMessageImages(options.messages);
  const formattedMessages = formatMessages(options.messages, imageKeyMap, options.systemPrompt);

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
