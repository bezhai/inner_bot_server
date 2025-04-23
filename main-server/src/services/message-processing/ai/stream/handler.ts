import { StreamedCompletionChunk } from '../../../../types/ai';
import { ActionHandler, StreamAction, EndOfReplyHandler, StreamDelta } from './types';

// 定义文本处理器接口
interface TextProcessor {
    process(text: string, context?: any): string;
    priority: number; // 优先级，数字越大优先级越高
}

// 从chunk中提取delta
function extractDelta(chunk: StreamedCompletionChunk): StreamDelta | null {
    if (!chunk.choices?.[0]?.delta) {
        return null;
    }
    return chunk.choices[0].delta as StreamDelta;
}

// 从文本中提取思维链内容
function extractThinkContent(text: string): {
    thinkContent: string | null;
    remainingText: string;
} {
    // 处理完整的思维链标签
    const thinkMatch = /^<think>([\s\S]*?)<\/think>/.exec(text);
    if (thinkMatch) {
        return {
            thinkContent: thinkMatch[1].trim(),
            remainingText: text.substring(thinkMatch[0].length).trim(),
        };
    }

    // 处理未闭合的思维链标签
    if (text.startsWith('<think>')) {
        return {
            thinkContent: text.substring(7).trim(),
            remainingText: '',
        };
    }

    return {
        thinkContent: null,
        remainingText: text,
    };
}

// 思维链处理器实现
class ThinkContentProcessor implements TextProcessor {
    priority = 100; // 高优先级

    process(text: string): string {
        const { thinkContent, remainingText } = extractThinkContent(text);
        return remainingText || text;
    }
}

// 引用标记处理器实现
class CitationProcessor implements TextProcessor {
    priority = 90;
    private citationUrls: string[] = [];

    constructor(citationUrls?: string[]) {
        if (citationUrls) {
            this.citationUrls = citationUrls;
        }
    }

    setCitationUrls(urls: string[]) {
        this.citationUrls = urls;
    }

    process(text: string): string {
        // 匹配形如[1]、[10]的引用标记
        return text.replace(/\[(\d+)\]/g, (match, number) => {
            const index = parseInt(number, 10);
            // 检查边界（序号从1开始）
            if (index < 1 || index > this.citationUrls.length) {
                return match; // 超出边界，保留原样
            }

            const url = this.citationUrls[index - 1];
            return `<number_tag background_color='grey-50' font_color='grey-600' url='${url}'>${number}</number_tag>`;
        });
    }
}

// 文本处理器管理器
class TextProcessorManager {
    private processors: TextProcessor[] = [];

    // 注册处理器
    register(processor: TextProcessor): void {
        this.processors.push(processor);
        // 按优先级排序
        this.processors.sort((a, b) => b.priority - a.priority);
    }

    // 处理文本
    process(text: string, context?: any): string {
        let processedText = text;
        for (const processor of this.processors) {
            processedText = processor.process(processedText, context);
        }
        return processedText;
    }

    // 获取指定类型的处理器
    getProcessor<T extends TextProcessor>(type: new (...args: any[]) => T): T | undefined {
        return this.processors.find((p) => p instanceof type) as T | undefined;
    }
}

// 从delta中提取actions
function extractActions(delta: StreamDelta): StreamAction[] {
    const actions: StreamAction[] = [];

    // 处理reasoning_content
    if (delta.reasoning_content?.trim()) {
        actions.push({
            type: 'think',
            content: delta.reasoning_content.trim(),
        });
    }

    // 处理content中的思维链和普通文本
    if (delta.content) {
        const { thinkContent, remainingText } = extractThinkContent(delta.content);

        if (thinkContent) {
            actions.push({
                type: 'think',
                content: thinkContent,
            });
        }

        if (remainingText) {
            actions.push({
                type: 'text',
                content: remainingText,
            });
        }
    }

    // 处理函数调用
    if (delta.function_call) {
        actions.push({
            type: 'function_call',
            function: {
                name: delta.function_call.name || '',
                arguments: delta.function_call.arguments || '',
            },
        });
    }

    return actions;
}

export interface HandleStreamResponseOptions {
    response: Response;
    handleAction: ActionHandler;
    endOfReply?: EndOfReplyHandler;
    textProcessorManager?: TextProcessorManager; // 新增：文本处理器管理器
    processingContext?: any; // 新增：处理上下文
}

// 创建默认的文本处理器管理器
function createDefaultTextProcessorManager(): TextProcessorManager {
    const manager = new TextProcessorManager();
    manager.register(new ThinkContentProcessor());
    manager.register(new CitationProcessor());
    return manager;
}

// 处理流式响应
export async function handleStreamResponse(options: HandleStreamResponseOptions): Promise<void> {
    const reader = options.response.body?.getReader();
    if (!reader) {
        throw new Error('无法读取响应流');
    }

    // 初始化文本处理器管理器（如果未提供）
    const textProcessorManager =
        options.textProcessorManager || createDefaultTextProcessorManager();

    // 数据累积状态
    let fullContent = ''; // 累积的普通文本内容
    let fullThinkContent = ''; // 累积的思维链内容
    let fullTaggedContent = ''; // 累积的带标签原始内容

    // 控制发送频率
    let buffer = '';
    let done = false;
    let lastUpdateTime = Date.now();
    const updateInterval = 500; // 更新间隔，毫秒

    // 记录已发送的内容，避免重复
    let lastSentThinkContent = '';
    let lastSentTextContent = '';

    try {
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                const chunkText = new TextDecoder().decode(value);
                buffer += chunkText;

                let lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (let line of lines) {
                    if (line.trim()) {
                        try {
                            const chunk: StreamedCompletionChunk = JSON.parse(line.trim());

                            // 处理可能的引用信息
                            if (chunk.citations) {
                                const citationProcessor =
                                    textProcessorManager.getProcessor(CitationProcessor);
                                if (citationProcessor && Array.isArray(chunk.citations)) {
                                    citationProcessor.setCitationUrls(chunk.citations);
                                }
                            }

                            const delta = extractDelta(chunk);
                            if (!delta) continue;

                            // 1. 处理增量内容
                            if (delta.content) {
                                fullTaggedContent += delta.content;
                                const { thinkContent, remainingText } =
                                    extractThinkContent(fullTaggedContent);

                                // 找到思维链内容时，更新思维链和普通文本
                                if (thinkContent) {
                                    fullThinkContent = thinkContent; // 覆盖而非累加
                                    fullContent = remainingText;
                                } else {
                                    // 没有思维链标签时，全部当作普通文本
                                    fullContent = fullTaggedContent;
                                }
                            }

                            // 2. 处理reasoning_content（无标签思维链）
                            if (delta.reasoning_content) {
                                // 只在没有<think>标签时处理reasoning_content
                                if (!fullTaggedContent.includes('<think>')) {
                                    fullThinkContent += delta.reasoning_content;
                                }
                            }

                            // 3. 处理来自delta的单条动作（主要是function_call）
                            const actions = extractActions(delta);
                            for (const action of actions) {
                                if (action.type === 'function_call') {
                                    // 函数调用立即处理，不受更新间隔限制
                                    await options.handleAction(action);
                                }
                                // 单条text/think动作不立即处理，等待批量更新
                            }
                        } catch (err) {
                            console.error('解析流式数据时出错:', err, '原始数据', line);
                        }
                    }
                }

                // 批量更新内容（受更新间隔控制）
                const now = Date.now();
                if (now - lastUpdateTime >= updateInterval) {
                    await updateContent();
                    lastUpdateTime = now;
                }
            }
        }

        // 最终更新，确保所有内容都被发送
        await updateContent();

        // 调用结束回调
        if (options.endOfReply) {
            const finalProcessedContent = textProcessorManager.process(
                fullContent.trim(),
                options.processingContext,
            );
            await options.endOfReply(finalProcessedContent || fullContent);
        }
    } catch (error) {
        console.error('处理流式响应时出错:', error);
        if (options.endOfReply) {
            await options.endOfReply(
                null,
                error instanceof Error ? error : new Error(String(error)),
            );
        }
        throw error;
    }

    // 更新累积的内容到UI
    async function updateContent() {
        // 1. 更新思维链内容（如果有新内容）
        const currentThinkContent = fullThinkContent.trim();
        if (currentThinkContent && currentThinkContent !== lastSentThinkContent) {
            await options.handleAction({
                type: 'think',
                content: currentThinkContent,
            });
            lastSentThinkContent = currentThinkContent;
        }

        // 2. 更新文本内容（如果有新内容）
        const processedContent = textProcessorManager.process(
            fullContent.trim(),
            options.processingContext,
        );

        if (processedContent && processedContent !== lastSentTextContent) {
            await options.handleAction({
                type: 'text',
                content: processedContent,
            });
            lastSentTextContent = processedContent;
        }
    }
}
