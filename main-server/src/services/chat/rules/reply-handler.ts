import {
  Config,
  LarkV2Card,
  MarkdownComponent,
  StreamConfig,
  Summary,
  withElementId,
} from "feishu-card";
import {
  searchMessageByRootId,
  updateRobotMessageText,
} from "../../messageStore/basic";
import { UserRepository } from "../../../dal/repositories/repositories";
import { In } from "typeorm";
import { replyText } from "../openai-service";
import { V2card } from "../../larkBasic/card";
import { saveRobotMessage } from "../../messageStore/service";
import { CommonMessage } from "../../../models/common-message";
import { get } from "../../../dal/redis";
import { CompletionRequest } from "../../../types/ai";

export async function makeCardReply(commonMessage: CommonMessage) {
  const v2CardPromise = (async () => {
    const v2Card = await V2card.create(
      new LarkV2Card()
        .withConfig(
          new Config()
            .withStreamingMode(
              true,
              new StreamConfig()
                .withPrintStrategy("delay")
                .withPrintFrequency(20)
                .withPrintStep(1)
            )
            .withSummary(new Summary("少女回复中"))
        )
        .addElements(withElementId(new MarkdownComponent(""), "md"))
    );

    await v2Card.reply(commonMessage.messageId);
    return v2Card;
  })();

  const searchMessagesPromise = searchMessageByRootId(commonMessage.rootId!);

  const chatModelPromise = get(`lark_chat_model:${commonMessage.chatId}`);

  const defaultPromptPromise = get("default_prompt");

  const chatPromptPromise = get(`lark_chat_prompt:${commonMessage.chatId}`);

  const modelParamsPromise = get(`model_params`)

  // 等待 V2Card 和消息搜索完成后再保存机器人消息
  const [v2Card, mongoMessages, chatModel, defaultPrompt, chatPrompt, modelParams] =
    await Promise.all([
      v2CardPromise,
      searchMessagesPromise,
      chatModelPromise,
      defaultPromptPromise,
      chatPromptPromise,
      modelParamsPromise
    ]);

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

  // 定义流式更新方法和结束回调
  const streamSendMsg = async (text: string) => {
    await v2Card.streamUpdateText("md", text);
  };

  const endOfReply = async (fullText: string) => {
    await Promise.allSettled([
      v2Card.closeUpdate(fullText),
      updateRobotMessageText(v2Card.getMessageId()!, fullText),
    ]);
  };

  await replyText(
    chatModel ?? "qwen-plus",
    contextMessages,
    streamSendMsg,
    streamSendMsg,
    chatPrompt ?? defaultPrompt ?? "",
    JSON.parse(modelParams ?? "{}") as Partial<CompletionRequest>,
    endOfReply
  );
}
