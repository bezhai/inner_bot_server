import {
  Config,
  LarkV2Card,
  MarkdownComponent,
  StreamConfig,
  Summary,
  withElementId,
} from "feishu-card";
import { CommonMessage } from "../../../types/receiveMessage";
import {
  searchMessageByRootId,
  updateRobotMessageText,
} from "../../messageStore/basic";
import { UserRepository } from "../../../dal/repositories/repositories";
import { In } from "typeorm";
import { replyText } from "../openaiService";
import { V2card } from "../../larkBasic/card";
import { saveRobotMessage } from "../../messageStore/service";

export async function makeCardReply(commonMessage: CommonMessage) {
  // 异步任务：创建 V2Card 并进行回复
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

  // 异步任务：搜索消息
  const searchMessagesPromise = searchMessageByRootId(commonMessage.rootId!);

  // 等待 V2Card 和消息搜索完成后再保存机器人消息
  const [v2Card, mongoMessages] = await Promise.all([
    v2CardPromise,
    searchMessagesPromise,
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

  // 模型信息
  const model = "gpt-4o-mini";
  // const model = "nemo";

  // 并行执行 replyText
  await replyText(
    model,
    contextMessages,
    streamSendMsg,
    streamSendMsg,
    endOfReply
  );

  console.log("所有任务都已完成");
}
