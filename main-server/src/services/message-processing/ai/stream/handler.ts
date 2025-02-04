import { StreamedCompletionChunk } from '../../../../types/ai';
import { ActionHandler, StreamAction, EndOfReplyHandler, StreamDelta } from './types';

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
}

// 处理流式响应
export async function handleStreamResponse(options: HandleStreamResponseOptions): Promise<void> {
  const reader = options.response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  let fullContent = ''; // 用于保存普通文本内容
  let fullThinkContent = ''; // 用于保存reasoning_content思维链内容
  let fullTaggedContent = ''; // 用于保存带标签的完整内容
  let buffer = '';
  let done = false;
  let lastProcessTime = Date.now();
  const processInterval = 500; // 500ms

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
              const delta = extractDelta(chunk);

              if (delta) {
                // 累积内容
                // 处理普通文本和标签思维链
                if (delta.content) {
                  fullTaggedContent += delta.content;
                  const { thinkContent, remainingText } = extractThinkContent(fullTaggedContent);
                  if (thinkContent) {
                    fullThinkContent = thinkContent; // 标签思维链覆盖reasoning_content
                    fullContent = remainingText;
                  } else {
                    fullContent = fullTaggedContent;
                  }
                }

                // 处理reasoning_content思维链
                if (delta.reasoning_content) {
                  if (!fullTaggedContent.includes('<think>')) {
                    // 只在没有标签思维链时处理
                    fullThinkContent += delta.reasoning_content; // 累积reasoning_content
                  }
                }

                // 处理actions
                const actions = extractActions(delta);
                for (const action of actions) {
                  if (action.type === 'function_call') {
                    // 函数调用立即处理
                    await options.handleAction(action);
                  } else {
                    // 文本内容定期处理
                    const now = Date.now();
                    if (now - lastProcessTime >= processInterval) {
                      if (fullThinkContent.trim()) {
                        await options.handleAction({
                          type: 'think',
                          content: fullThinkContent.trim(),
                        });
                      }
                      if (fullContent.trim()) {
                        await options.handleAction({
                          type: 'text',
                          content: fullContent.trim(),
                        });
                      }
                      lastProcessTime = now;
                    }
                  }
                }
              }
            } catch (err) {
              console.error('解析流式数据时出错:', err, '原始数据', line);
            }
          }
        }
      }
    }

    // 处理最后的内容
    if (fullThinkContent.trim()) {
      await options.handleAction({
        type: 'think',
        content: fullThinkContent.trim(),
      });
    }
    if (fullContent.trim()) {
      await options.handleAction({
        type: 'text',
        content: fullContent.trim(),
      });
    }

    // 调用结束回调
    if (options.endOfReply) {
      await options.endOfReply(fullContent);
    }
  } catch (error) {
    console.error('处理流式响应时出错:', error);
    if (options.endOfReply) {
      await options.endOfReply(null, error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}
