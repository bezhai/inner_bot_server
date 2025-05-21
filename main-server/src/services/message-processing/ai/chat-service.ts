import { CompletionRequest, WebSearchResult } from '../../../types/ai';
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

    const webSearchResult = await searchWeb(options.messages, options.enableWebSearch);

    // 如果 webSearchResult 不为空，临时改写系统Prompt
    if (webSearchResult) {
        options.systemPrompt = `
        ${options.systemPrompt}

        # 额外规则
        1. 请参考以下网络搜索结果，作为知识库的补充，回答用户的问题。

        ## 网络搜索结果：
        
        ${webSearchResult.answer_box ? `- 直接回答：${webSearchResult.answer_box.snippet}` : ''}
        ${webSearchResult.organic_results.map((result) => `- 辅助搜索结果：${result.title}\n${result.link}\n${result.snippet}`).join('\n')}
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


async function searchWeb(messages: Message[], enableWebSearch: boolean | undefined): Promise<WebSearchResult | null> {
    if (!enableWebSearch) {
        return null;
    }

    const message = messages.map(
        (message) => {
            const tag = message.isRobotMessage ? 'assistant' : 'user';
            return `<${tag}> ${message.clearText()} </${tag}>`;
        },
    ).join('\n');

    return await searchWebWithAI(message);
}

