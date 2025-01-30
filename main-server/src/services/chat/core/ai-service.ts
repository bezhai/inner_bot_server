import { CompletionRequest, NonStreamedCompletion } from "../../../types/ai";
import { ActionHandler, EndOfReplyHandler } from "./stream/types";
import { handleStreamResponse } from "./stream/handler";

// 处理非流式响应
function handleNonStreamResponse(
  response: NonStreamedCompletion,
  handleAction: ActionHandler
) {
  handleAction({
    type: 'text',
    content: response.choices[0].message.content
  });
}

// 主函数：处理流式和非流式请求
export async function getCompletion(
  payload: CompletionRequest,
  handleAction: ActionHandler,
  endOfReply?: EndOfReplyHandler
): Promise<void> {
  try {
    console.info("请求参数:", payload);

    const response = await fetch(
      `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`请求失败，状态码：${response.status}`);
    }

    const transferEncoding = response.headers.get("transfer-encoding");

    if (transferEncoding === "chunked") {
      // 流式响应
      return await handleStreamResponse(response, handleAction, endOfReply);
    } else {
      // 非流式响应
      const json: NonStreamedCompletion = await response.json();
      return handleNonStreamResponse(json, handleAction);
    }
  } catch (error) {
    console.error("请求出错:", error);
    if (endOfReply) {
      await endOfReply(null, error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}

// 获取可用模型列表
export async function getModelList(): Promise<string[]> {
  const response = await fetch(
    `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}/model/list`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Request failed with status code: ${response.status}`);
  }

  const modelList: string[] = await response.json();
  return modelList;
}

export type { ActionHandler, EndOfReplyHandler };
