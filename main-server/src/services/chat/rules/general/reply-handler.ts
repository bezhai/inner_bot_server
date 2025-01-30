import {
  LarkV2Card,
  Config,
  StreamConfig,
  Summary,
  withElementId,
  CollapsiblePanelComponent,
  CollapsiblePanelHeader,
  MarkdownComponent,
  HrComponent,
} from "feishu-card";
import { In } from "typeorm";
import { UserRepository } from "../../../../dal/repositories/repositories";
import { CommonMessage } from "../../../../models/common-message";
import { CompletionRequest } from "../../../../types/ai";
import { FeishuCardUpdater } from "../../../lark/adapters/feishu/card-updater";
import { V2card } from "../../../lark/basic/card";
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

  const v2Card = await (async () => {
    // 创建一个简单的卡片，只包含基本配置
    const larkCard = new LarkV2Card().withConfig(
      new Config()
        .withStreamingMode(
          true,
          new StreamConfig()
            .withPrintStrategy("fast")
            .withPrintFrequency(20)
            .withPrintStep(4)
        )
        .withSummary(new Summary("少女回复中"))
    );

    // 添加分割线和思考中提示
    larkCard.addElements(
      withElementId(new HrComponent(), "hr"),
      withElementId(new MarkdownComponent("赤尾思考中..."), "thinking_placeholder")
    );

    const v2Card = await V2card.create(larkCard);

    await v2Card.reply(commonMessage.messageId);
    return v2Card;
  })();

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
    v2Card.getMessageId()!,
    v2Card.getCardId()!
  );

  // 创建卡片更新器
  const cardUpdater = new FeishuCardUpdater(v2Card);

  try {
    await replyText(
      chatModel ?? "qwen-plus",
      contextMessages,
      cardUpdater.createActionHandler(),
      chatPrompt ?? defaultPrompt ?? "",
      JSON.parse(modelParams ?? "{}") as Partial<CompletionRequest>,
      cardUpdater.closeUpdate.bind(cardUpdater)
    );
  } catch (error) {
    // Error will be handled by closeUpdate through endOfReply callback
    console.error("回复消息时出错:", error);
  }
}
