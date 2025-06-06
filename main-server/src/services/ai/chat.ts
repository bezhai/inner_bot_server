import { StreamAction } from 'types/ai';
import { ChatMessage, ChatRequest, ChatResponse, Step, StoreRobotMessageRequest } from 'types/chat';
import { SSEClient } from 'utils/sse/client';
import { ChatStateMachineManager } from './chat-state-machine';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

/**
 * 扩展版本：支持更多回调和状态监控
 */
export interface SSEChatOptions {
    req: ChatRequest;
    onAccept?: () => Promise<void>; // 收到消息
    onStartReply?: () => Promise<void>; // 开始回复消息
    onSend?: (action: StreamAction) => Promise<void>; // 发送消息
    onSuccess?: (content: string) => Promise<void>; // 回复成功
    onFailed?: (error: Error) => Promise<void>; // 回复失败
    onEnd?: () => Promise<void>; // 结束
    onClose?: () => Promise<void>; // 关闭, 暂时没用
    onStateChange?: (from: Step | null, to: Step) => void; // 状态变化
    onSaveMessage?: (content: string) => Promise<ChatMessage | undefined>; // 保存消息, content 从sseChat中获取, 其他字段从onSaveMessage中获取
}

/**
 * 存储机器人发送的消息, 这是因为发消息是main-server负责的, ai-service并不能直接去存储机器人发的消息
 * @param message 消息
 * @returns 
 */
export async function storeRobotMessage(message: ChatMessage): Promise<void> {
    const req: StoreRobotMessageRequest = {
        message,
    };

    const res = await fetch(`${BASE_URL}/chat/store_message`, {
        method: 'POST',
        body: JSON.stringify(req),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        console.error('Failed to store robot message:', await res.json());
    }
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
        onSuccess: async (content) => {
            await options.onSuccess?.(content);
            if (options.onSaveMessage) {
                const message = await options.onSaveMessage(content);
                if (message) {
                    await storeRobotMessage(message);
                }
            } // hook 保存消息
        },
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
