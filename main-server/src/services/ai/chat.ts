import { StreamAction } from 'types/ai';
import { ChatRequest, ChatResponse, Step } from 'types/chat';
import { SSEClient } from 'utils/sse/client';
import { ChatStateMachineManager } from './chat-state-machine';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

/**
 * 扩展版本：支持更多回调和状态监控
 */
export interface SSEChatOptions {
    req: ChatRequest;
    onAccept?: () => Promise<void>;
    onStartReply?: () => Promise<void>;
    onSend?: (action: StreamAction) => Promise<void>;
    onSuccess?: (content: string) => Promise<void>;
    onFailed?: (error: Error) => Promise<void>;
    onEnd?: () => Promise<void>;
    onStateChange?: (from: Step | null, to: Step) => void;
}

/**
 * 向ai-service发送sse请求
 */
export async function sseChat(options: SSEChatOptions): Promise<() => void> {
    const client = new SSEClient<ChatResponse>(`${BASE_URL}/chat/sse`, {
        method: 'POST' as const,
        headers: {
            'Content-Type': 'application/json',
        },
        body: options.req,
        retries: 3,
        retryDelay: 1000,
        autoReconnect: true,
    });

    const stateMachine = new ChatStateMachineManager({
        onAccept: options.onAccept,
        onStartReply: options.onStartReply,
        onSend: options.onSend,
        onSuccess: options.onSuccess,
        onFailed: options.onFailed,
        onEnd: options.onEnd,
    });

    const onMessage = async (message: ChatResponse) => {
        try {
            const previousState = stateMachine.getCurrentState();

            const stateData = {
                step: message.step,
                content: 'content' in message ? message.content : undefined,
                reason_content: 'reason_content' in message ? message.reason_content : undefined,
            };

            const success = await stateMachine.handleResponse(stateData);

            if (success && options.onStateChange) {
                options.onStateChange(previousState, message.step);
            }

            if (!success) {
                console.warn('状态转换失败，忽略响应:', message);
            }
        } catch (error) {
            console.error('处理聊天响应时出错:', error);
            await stateMachine.forceEnd(error instanceof Error ? error : new Error(String(error)));
        }
    };

    const onError = async (error: unknown) => {
        console.error('SSE 连接错误:', error);
        await stateMachine.forceEnd(error instanceof Error ? error : new Error(String(error)));
    };

    return client.connect((message) => onMessage(message.data), onError);
}
