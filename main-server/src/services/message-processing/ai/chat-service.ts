import { CompletionRequest } from '../../../types/ai';
import { CommonMessage } from '../../../models/common-message';
import { processChatCompletion } from './chat-completion';
import { formatMessages } from './message-formatter';
import { ActionHandler, EndOfReplyHandler } from './stream/types';

export async function generateChatResponse(
  model: string,
  messages: CommonMessage[],
  handleAction: ActionHandler,
  systemPrompt?: string,
  chatParams?: Partial<CompletionRequest>,
  endOfReply?: EndOfReplyHandler,
) {
  const formattedMessages = formatMessages(messages, systemPrompt);

  await processChatCompletion(
    {
      model,
      messages: formattedMessages,
      stream: true,
      ...chatParams,
    },
    handleAction,
    endOfReply,
  );
}
