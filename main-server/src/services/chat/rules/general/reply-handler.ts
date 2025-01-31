import { In } from "typeorm";
import { UserRepository } from "../../../../dal/repositories/repositories";
import { CommonMessage } from "../../../../models/common-message";
import { CompletionRequest } from "../../../../types/ai";
import { CardManager } from "../../../lark/basic/card-manager";
import { replyText } from "../../core/openai-service";
import { get } from "../../../../dal/redis";
import { searchMessageByRootId } from "../../../message-store/basic";
import { saveRobotMessage } from "../../../message-store/service";

export async function makeCardReply(commonMessage: CommonMessage) {
  const searchMessagesPromise = searchMessageByRootId(commonMessage.rootId!);

  const chatModelPromise = get(`lark_chat_model:${commonMessage.chatId}`);

  const defaultPromptPromise = get("default_prompt");

  const chatPromptPromise = get(`lark_chat_prompt:${commonMessage.chatId}`);

  const modelParamsPromise = get(`model_params`);

  // 等待 V2Card 和消息搜索完成后再保存机器人消息
  const [mongoMessages, chatModel, defaultPrompt, chatPrompt, modelParams] =
    await Promise.all([
      searchMessagesPromise,
      chatModelPromise,
      defaultPromptPromise,
      chatPromptPromise,
      modelParamsPromise,
    ]);

  const cardManager = await CardManager.createReplyCard();
  await cardManager.replyToMessage(commonMessage.messageId);

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
      if (msg.isRobotMessage) {
        msg.senderName = "赤尾小助手";
      } else {
        msg.senderName = userMap.get(msg.sender) || undefined;
      }
    });
  }

  // 保存机器人消息
  await saveRobotMessage(
    commonMessage,
    cardManager.getMessageId()!,
    cardManager.getCardId()!
  );

  try {
    await replyText(
      chatModel ?? "qwen-plus",
      contextMessages,
      cardManager.createActionHandler(),
      chatPrompt ?? defaultPrompt ?? "",
      JSON.parse(modelParams ?? "{}") as Partial<CompletionRequest>,
      cardManager.closeUpdate.bind(cardManager)
    );
  } catch (error) {
    // Error will be handled by closeUpdate through endOfReply callback
    console.error("回复消息时出错:", error);
  }
}
