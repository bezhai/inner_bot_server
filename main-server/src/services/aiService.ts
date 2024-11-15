import dayjs from "dayjs";
import {
  StreamedCompletionChunk,
  NonStreamedCompletion,
  CompletionRequest,
} from "../types/ai";

async function handleStreamResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取响应流");
    }
  
    let fullResponse = "";
    let done = false;
    let buffer = "";  // 用来存储不完整的 JSON 数据
  
    while (!done) {
      // 逐块读取响应体
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
  
      if (value) {
        // 将 Uint8Array 转为字符串并累积到 buffer 中
        const chunkText = new TextDecoder().decode(value);
        buffer += chunkText;
  
        // 使用正则表达式匹配每个独立的 JSON 对象
        const jsonObjects = buffer.match(/({.*?})(?={|$)/g) || [];
  
        // 清空 buffer，只保留最后一个可能不完整的 JSON 对象
        buffer = buffer.endsWith("}") ? "" : buffer.slice(buffer.lastIndexOf("}") + 1);
  
        // 逐个处理 JSON 对象
        for (let jsonObject of jsonObjects) {
          try {
            const chunk: StreamedCompletionChunk = JSON.parse(jsonObject.trim());
  
            // 检查 choices 是否存在且有内容
            if (chunk.choices && chunk.choices.length > 0) {
              const deltaContent = chunk.choices[0].delta?.content;
              if (deltaContent) {
                // 保留原始日志输出
                console.log(
                  "流式响应内容:",
                  "[",
                  deltaContent,
                  "]",
                  dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")
                );
                fullResponse += deltaContent;  // 累积生成的内容
              }
            }
          } catch (err) {
            // 保留原始数据日志
            console.error("解析流式数据时出错:", err, "原始数据", jsonObject);
          }
        }
      }
    }
  
    return fullResponse;
  }

// 处理非流式响应
function handleNonStreamResponse(
  response: NonStreamedCompletion
): string | null {
  return response.choices[0].message.content;
}

// 主函数：处理流式和非流式请求
export async function getCompletion(
  payload: CompletionRequest
): Promise<string | null> {
  try {
    const response = await fetch("http://ai-app:8000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`请求失败，状态码：${response.status}`);
    }

    // 检查是否是流式响应

    const transferEncoding = response.headers.get("transfer-encoding");

    if (transferEncoding === "chunked") {
      // 流式响应
      return await handleStreamResponse(response);
    } else {
      // 非流式响应
      const json: NonStreamedCompletion = await response.json();
      return handleNonStreamResponse(json);
    }
  } catch (error) {
    console.error("请求出错:", error);
    return "请求失败，请重试";
  }
}
