import { CompletionRequest } from '../../../types/ai';
import { ActionHandler, EndOfReplyHandler } from './stream/types';
import { fetchChatCompletion } from './http-client';
import { handleCompletion } from './completion-handler';

export interface ProcessChatCompletionOptions {
  payload: CompletionRequest;
  handleAction: ActionHandler;
  endOfReply?: EndOfReplyHandler;
}

export async function processChatCompletion(options: ProcessChatCompletionOptions): Promise<void> {
  try {
    console.info('Chat completion request:', options.payload);
    const response = await fetchChatCompletion(options.payload);
    return await handleCompletion({
      response,
      handleAction: options.handleAction,
      endOfReply: options.endOfReply,
    });
  } catch (error) {
    console.error('Chat completion error:', error);
    if (options.endOfReply) {
      await options.endOfReply(null, error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}
