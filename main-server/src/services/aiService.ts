import dayjs from "dayjs";
import {
  StreamedCompletionChunk,
  NonStreamedCompletion,
  CompletionRequest,
} from "../types/ai";

export type UpdateTextFunction = (updatedText: string) => Promise<void>;

async function handleStreamResponse(
  response: Response,
  updateTextAPI: UpdateTextFunction,
  endOfReply?: (fullText: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
  }

  let fullResponse = ""; // 累积的全量文本
  let done = false;
  let buffer = ""; // 用来存储不完整的 JSON 数据

  const intervalId = setInterval(async () => {
    if (fullResponse) {
      await updateTextAPI(fullResponse); // 调用API更新文本
    }
  }, 500);

  try {
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (value) {
        // 将 Uint8Array 转为字符串并累积到 buffer 中
        const chunkText = new TextDecoder().decode(value);
        buffer += chunkText;

        // 按换行符拆分每个 JSON 块（假设每行是一个 JSON 对象）
        let lines = buffer.split("\n");

        // 保留最后一行，可能是不完整的 JSON 数据
        buffer = lines.pop() || "";

        // 逐行处理 JSON 数据
        for (let line of lines) {
          if (line.trim()) {
            // 跳过空行
            try {
              const chunk: StreamedCompletionChunk = JSON.parse(line.trim());

              // 检查 choices 是否存在且有内容
              if (chunk.choices && chunk.choices.length > 0) {
                const deltaContent = chunk.choices[0].delta?.content;
                if (deltaContent) {
                  // 累积全量文本
                  fullResponse += deltaContent;
                }
              }
            } catch (err) {
              console.error("解析流式数据时出错:", err, "原始数据", line);
            }
          }
        }
      }
    }
  } finally {
    // 停止定时器
    clearInterval(intervalId);
  }

  // 流结束时，确保调用一次API，发送最终的全量文本
  if (fullResponse) {
    console.log("最终文本内容:", fullResponse);
    await updateTextAPI(fullResponse);
    if (endOfReply) {
      await endOfReply(fullResponse);
    }
  }
}

// 处理非流式响应
function handleNonStreamResponse(
  response: NonStreamedCompletion,
  nonStreamUpdateAPI: UpdateTextFunction
) {
  nonStreamUpdateAPI(response.choices[0].message.content);
}

// 主函数：处理流式和非流式请求
export async function getCompletion(
  payload: CompletionRequest,
  streamUpdateAPI: UpdateTextFunction,
  nonStreamUpdateAPI: UpdateTextFunction,
  endOfReply?: (fullText: string) => void,
): Promise<void> {
  try {
    const response = await fetch(`http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}/chat`, {
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
      return await handleStreamResponse(response, streamUpdateAPI, endOfReply);
    } else {
      // 非流式响应
      const json: NonStreamedCompletion = await response.json();
      return handleNonStreamResponse(json, nonStreamUpdateAPI);
    }
  } catch (error) {
    console.error("请求出错:", error);
  }
}
