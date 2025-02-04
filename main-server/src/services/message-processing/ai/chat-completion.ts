import { CompletionRequest } from "../../../types/ai";
import { ActionHandler, EndOfReplyHandler } from "./stream/types";
import { fetchChatCompletion, fetchAvailableModels } from "./http-client";
import { handleCompletion } from "./completion-handler";

export async function processChatCompletion(
  payload: CompletionRequest,
  handleAction: ActionHandler,
  endOfReply?: EndOfReplyHandler
): Promise<void> {
  try {
    console.info("Chat completion request:", payload);
    const response = await fetchChatCompletion(payload);
    return await handleCompletion(response, handleAction, endOfReply);
  } catch (error) {
    console.error("Chat completion error:", error);
    if (endOfReply) {
      await endOfReply(
        null,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    throw error;
  }
}

export async function getAvailableModels(): Promise<string[]> {
  return await fetchAvailableModels();
}

export type { ActionHandler, EndOfReplyHandler };
