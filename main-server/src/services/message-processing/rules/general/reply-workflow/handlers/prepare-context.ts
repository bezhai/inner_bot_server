import { CardManager } from "../../../../../lark/basic/card-manager";
import { saveRobotMessage } from "../../../../../message-store/service";
import { prepareContextMessages, fetchChatConfig } from "../../reply-utils";
import { ReplyContext } from "../types";

export async function prepareContextHandler(context: ReplyContext): Promise<void> {
  // 创建回复卡片
  const cardManager = await CardManager.createReplyCard();
  await cardManager.replyToMessage(context.commonMessage.messageId);

  // 准备上下文消息
  const contextMessages = await prepareContextMessages(context.commonMessage);

  // 获取聊天配置
  const config = await fetchChatConfig(context.commonMessage.chatId);

  // 保存到上下文
  context.cardManager = cardManager;
  context.contextMessages = contextMessages;
  context.config = config;

  // 保存机器人消息
  await saveRobotMessage(
    context.commonMessage,
    cardManager.getMessageId()!,
    cardManager.getCardId()!
  );
}
