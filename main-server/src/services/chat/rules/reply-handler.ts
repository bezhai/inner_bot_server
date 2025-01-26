import {
  CollapsiblePanelComponent,
  CollapsiblePanelHeader,
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

  // 定义流式更新方法和结束回调
  const streamSendMsg = async (text: string) => {
    // 提取思维链内容的函数
    const extractThinkContent = (
      text: string
    ): { thinkContent: string; regularContent: string } => {
      const thinkMatch = /<think>([\s\S]*?)<\/think>/.exec(text);
      if (!thinkMatch) {
        // 如果没有完整的思维链标签，但以<think>开头
        if (text.startsWith("<think>")) {
          return {
            thinkContent: text.substring(7), // 去掉开头的<think>
            regularContent: "",
          };
        }
        // 完全没有思维链
        return {
          thinkContent: "",
          regularContent: text,
        };
      }
      // 有完整的思维链
      return {
        thinkContent: thinkMatch[1],
        regularContent: text.replace(/<think>[\s\S]*?<\/think>/, "").trim(),
      };
    };

    const newContents = extractThinkContent(text);

    if (newContents.thinkContent.length > 0) {
      await v2Card.streamUpdateText("reason_md", newContents.thinkContent);
    }

    if (newContents.regularContent.length > 0) {
      await v2Card.streamUpdateText("md", newContents.regularContent);
    }
  };

  const endOfReply = async (fullText: string) => {
    // 这里临时针对 deepseek r1 模型的输出做处理, 保存时不要有思维链
    const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, "");
    await Promise.allSettled([
      v2Card.closeUpdate(fullText),
      updateRobotMessageText(v2Card.getMessageId()!, removeThinkText),
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
