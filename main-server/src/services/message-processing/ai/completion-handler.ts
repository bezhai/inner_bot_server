import { NonStreamedCompletion } from '../../../types/ai';
import { ActionHandler, EndOfReplyHandler } from './stream/types';
import { handleStreamResponse } from './stream/handler';

export interface HandleCompletionOptions {
    response: Response;
    handleAction: ActionHandler;
    endOfReply?: EndOfReplyHandler;
}

interface HandleNonStreamedCompletionOptions {
    response: Response;
    handleAction: ActionHandler;
}

export async function handleCompletion(options: HandleCompletionOptions): Promise<void> {
    const transferEncoding = options.response.headers.get('transfer-encoding');

    if (transferEncoding === 'chunked') {
        return await handleStreamResponse({
            response: options.response,
            handleAction: options.handleAction,
            endOfReply: options.endOfReply,
        });
    } else {
        return await handleNonStreamedCompletion({
            response: options.response,
            handleAction: options.handleAction,
        });
    }
}

async function handleNonStreamedCompletion(
    options: HandleNonStreamedCompletionOptions,
): Promise<void> {
    const completion: NonStreamedCompletion = await options.response.json();
    options.handleAction({
        type: 'text',
        content: completion.choices[0].message.content,
    });
}
