/**
 * @file ai-chat.ts
 * @description AI聊天相关类型定义，从ai-service迁移而来
 */

/**
 * 工具调用反馈响应
 */
export interface ToolCallFeedbackResponse {
    name: string; // 工具调用名称
    nick_name?: string; // 工具调用昵称
    status_message?: string; // 状态消息，用于更新底部栏显示
}

/**
 * 聊天流式响应块
 */
export interface ChatStreamChunk {
    reason_content?: string; // 思维链内容
    content?: string; // 回复内容
    tool_call_feedback?: ToolCallFeedbackResponse; // 工具调用反馈
}

/**
 * 聊天简单消息
 */
export interface ChatSimpleMessage {
    user_name: string; // 用户名
    content: string; // 转义成markdown的消息内容，包括图片等
    role: 'user' | 'assistant' | 'system'; // 角色
}

/**
 * 提示词生成参数
 */
export interface PromptGeneratorParam {
    [key: string]: any;
}

/**
 * 模型配置
 */
export interface ModelConfig {
    id: string; // 模型ID
    name: string; // 模型名称
}

/**
 * 内容过滤错误
 */
export class ContentFilterError extends Error {
    constructor() {
        super('内容被过滤');
        this.name = 'ContentFilterError';
    }
}

/**
 * 检查ChatStreamChunk是否有内容
 */
export function hasContent(chunk: ChatStreamChunk): boolean {
    return !!(
        (chunk.content && chunk.content.trim()) ||
        (chunk.reason_content && chunk.reason_content.trim())
    );
}