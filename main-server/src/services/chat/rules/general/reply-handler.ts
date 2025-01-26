import {
  LarkV2Card,
  Config,
  StreamConfig,
  Summary,
  withElementId,
  CollapsiblePanelComponent,
  CollapsiblePanelHeader,
  MarkdownComponent,
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

    // 这里给思维链先hardcode一下
    if (chatModel === "ds-local" || chatModel === "deepseek-r1") {
      larkCard.addElements(
        withElementId(
          new CollapsiblePanelComponent(
            new CollapsiblePanelHeader("赤尾的内心思考").setBackgroundColor(
              "grey-100"
            )
          )
            .setBorder("grey-100")
            .addElement(withElementId(new MarkdownComponent(""), "reason_md")),
          "collapse"
        )
      );
    }

    larkCard.addElements(withElementId(new MarkdownComponent(""), "md"));

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

  await replyText(
    chatModel ?? "qwen-plus",
    contextMessages,
    cardUpdater.createActionHandler(),
    chatPrompt ?? defaultPrompt ?? "",
    JSON.parse(modelParams ?? "{}") as Partial<CompletionRequest>,
    cardUpdater.closeUpdate.bind(cardUpdater)
  );
}
