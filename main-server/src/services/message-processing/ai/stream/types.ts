import { FunctionCall } from '../../../../types/ai';

// 基础响应类型
export type BaseAction = {
    type: string;
};

// 思维链响应
export type ThinkAction = BaseAction & {
    type: 'think';
    content: string;
};

// 文本响应
export type TextAction = BaseAction & {
    type: 'text';
    content: string;
};

// 函数调用响应
export type FunctionCallAction = BaseAction & {
    type: 'function_call';
    function: FunctionCall;
};

// 统一的Action类型
export type StreamAction = ThinkAction | TextAction | FunctionCallAction;

// Action处理器类型
export type ActionHandler = (action: StreamAction) => Promise<void>;

// 请求结束回调类型
export type EndOfReplyHandler = (finalContent: string | null, error?: Error) => Promise<void>;

// 流式响应的Delta类型
export interface StreamDelta {
    content?: string;
    reasoning_content?: string;
    function_call?: FunctionCall;
}
