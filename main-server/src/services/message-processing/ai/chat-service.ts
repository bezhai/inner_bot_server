import { CompletionRequest } from '../../../types/ai';
import { Message } from '../../../models/message';
import { processChatCompletion } from './chat-completion';
import { formatMessages, getMessageImagesBase64 } from './message-formatter';
import { ActionHandler, EndOfReplyHandler } from './stream/types';
import { searchWebWithAI } from './http-client';

export interface ChatResponseOptions {
    model: string;
    messages: Message[];
    handleAction: ActionHandler;
    systemPrompt?: string;
    chatParams?: Partial<CompletionRequest>;
    endOfReply?: EndOfReplyHandler;
    enableWebSearch?: boolean;
}

export async function generateChatResponse(options: ChatResponseOptions) {
    const imageBase64Map = await getMessageImagesBase64(options.messages);

    const webSearchResults = await searchWeb(options.messages, options.enableWebSearch);

    // 如果 webSearchResults 不为空，临时改写系统Prompt
    if (webSearchResults) {
        options.systemPrompt = `
        ${options.systemPrompt}

        ## 以下是网络搜索结果：
        ${webSearchResults}
        `;
    }

    const formattedMessages = formatMessages(
        options.messages,
        imageBase64Map,
        options.systemPrompt,
    );

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


async function searchWeb(messages: Message[], enableWebSearch: boolean | undefined): Promise<string> {
    if (!enableWebSearch) {
        return '';
    }

    const message = messages.map(
        (message) => {
            const tag = message.isRobotMessage ? 'assistant' : 'user';
            return `<${tag}> ${message.clearText()} </${tag}>`;
        },
    ).join('\n');

    const webSearchResults = await searchWebWithAI(message);

    return webSearchResults.join('\n');
}

