import { In } from "typeorm";
import { UserRepository } from "../../../../dal/repositories/repositories";
import { CommonMessage } from "../../../../models/common-message";
import { CompletionRequest } from "../../../../types/ai";
import { CardManager } from "../../../lark/basic/card-manager";
import { generateChatResponse } from "../../core/chat-service";
import { get } from "../../../../dal/redis";
import { searchMessageByRootId } from "../../../message-store/basic";
import { saveRobotMessage } from "../../../message-store/service";

async function prepareContextMessages(commonMessage: CommonMessage) {
  const mongoMessages = await searchMessageByRootId(commonMessage.rootId!);
  const contextMessages = mongoMessages.map((msg) =>
    CommonMessage.fromMessage(msg)
  );

  const userIds = contextMessages
    .filter((msg) => !msg.isRobotMessage)
    .map((msg) => msg.sender);

  if (userIds.length > 0) {
    const userInfos = await UserRepository.findBy({ union_id: In(userIds) });
    const userMap = new Map(
      userInfos.map((user) => [user.union_id, user.name])
    );

    contextMessages.forEach((msg) => {
      msg.senderName = msg.isRobotMessage
        ? "赤尾小助手"
        : userMap.get(msg.sender);
    });
  }

  return contextMessages;
}

async function fetchChatConfig(chatId: string) {
  const [chatModel, defaultPrompt, chatPrompt, modelParams] = await Promise.all(
    [
      get(`lark_chat_model:${chatId}`),
      get("default_prompt"),
      get(`lark_chat_prompt:${chatId}`),
      get("model_params"),
    ]
  );

  return {
    model: chatModel ?? "qwen-plus",
    prompt: chatPrompt ?? defaultPrompt ?? "",
    params: JSON.parse(modelParams ?? "{}") as Partial<CompletionRequest>,
  };
}

export async function makeCardReply(commonMessage: CommonMessage) {
  // 创建回复卡片
  const cardManager = await CardManager.createReplyCard();
  await cardManager.replyToMessage(commonMessage.messageId);

  // 准备上下文消息
  const contextMessages = await prepareContextMessages(commonMessage);

  // 获取聊天配置
  const config = await fetchChatConfig(commonMessage.chatId);

  // 保存机器人消息
  await saveRobotMessage(
    commonMessage,
    cardManager.getMessageId()!,
    cardManager.getCardId()!
  );

  try {
    await generateChatResponse(
      config.model,
      contextMessages,
      cardManager.createActionHandler(),
      config.prompt,
      config.params,
      cardManager.closeUpdate.bind(cardManager)
    );
  } catch (error) {
    console.error("回复消息时出错:", error);
    // Error will be handled by closeUpdate through endOfReply callback
  }
}
