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

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;

    if (value) {
      // 将 Uint8Array 转为字符串
      const chunkText = new TextDecoder().decode(value);

      // 解析 JSON 数据
      try {
        const chunk: StreamedCompletionChunk = JSON.parse(chunkText);

        // 检查 choices 是否存在且有内容
        if (chunk.choices && chunk.choices.length > 0) {
          const deltaContent = chunk.choices[0].delta?.content;
          if (deltaContent) {
            console.log("流式响应内容:", deltaContent, "时间", dayjs().format("YYYY-MM-DD HH:mm:ss.SSS"));
            fullResponse += deltaContent; // 累积生成的内容
          }
        }
      } catch (err) {
        console.error("解析流式数据时出错:", err, "原始数据", chunkText);
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
