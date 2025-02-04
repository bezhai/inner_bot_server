import { NonStreamedCompletion } from '../../../types/ai';
import { ActionHandler, EndOfReplyHandler } from './stream/types';
import { handleStreamResponse } from './stream/handler';

export async function handleCompletion(
  response: Response,
  handleAction: ActionHandler,
  endOfReply?: EndOfReplyHandler,
): Promise<void> {
  const transferEncoding = response.headers.get('transfer-encoding');

  if (transferEncoding === 'chunked') {
    return await handleStreamResponse(response, handleAction, endOfReply);
  } else {
    return await handleNonStreamedCompletion(response, handleAction);
  }
}

async function handleNonStreamedCompletion(response: Response, handleAction: ActionHandler): Promise<void> {
  const completion: NonStreamedCompletion = await response.json();
  handleAction({
    type: 'text',
    content: completion.choices[0].message.content,
  });
}
