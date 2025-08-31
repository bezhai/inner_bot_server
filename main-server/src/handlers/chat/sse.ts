/**
 * @file sse.ts
 * @description SSE聊天接口处理器
 */

import { Context } from 'koa';
import { ChatRequest } from '../../types/chat';
import { AiChatService } from '../../services/ai/chat-service';
import logger from '../../services/logger';

/**
 * SSE聊天接口处理函数
 */
export async function handleChatSse(ctx: Context): Promise<void> {
    try {
        // 解析请求体
        const request = ctx.request.body as ChatRequest;
        
        if (!request.message_id) {
            ctx.status = 400;
            ctx.body = { error: 'message_id is required' };
            return;
        }

        logger.info(`开始处理SSE聊天请求: ${request.message_id}`);

        // 设置SSE响应头
        ctx.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        });

        ctx.status = 200;

        // 创建可写流
        const stream = ctx.res;
        
        // 发送SSE数据的辅助函数
        const sendSSEData = (data: any, event?: string) => {
            const jsonData = JSON.stringify(data);
            let sseMessage = `data: ${jsonData}\n\n`;
            
            if (event) {
                sseMessage = `event: ${event}\n${sseMessage}`;
            }
            
            stream.write(sseMessage);
        };

        try {
            // 处理聊天流程
            const chatStream = AiChatService.processChatSse(request);

            for await (const response of chatStream) {
                sendSSEData(response);
            }

        } catch (error) {
            logger.error('SSE聊天流程处理失败', { error, messageId: request.message_id });
            sendSSEData({ step: 'failed' });
        } finally {
            // 发送结束标记
            sendSSEData({ step: 'end' });
            stream.end();
        }

    } catch (error) {
        logger.error('SSE聊天接口处理失败', { error });
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
    }
}