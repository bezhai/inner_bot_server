import {
  Config,
  LarkV2Card,
  MarkdownComponent,
  StreamConfig,
  Summary,
  withElementId,
} from "feishu-card";
import { LarkReceiveMessage } from "../../types/lark";
import { V2card } from "../lark/card";
import { replyText } from "../openaiService";
import { MessageFactory } from "./messageFactory";
import {
  LarkRobotMessageMetaInfo,
  LarkUserMessageMetaInfo,
} from "../../types/mongo";
import dayjs from "dayjs";
import {
  saveMessage,
  searchMessageByRootId,
  updateRobotMessageText,
} from "../messageStore/store";
import { CommonMessage } from "../../types/receiveMessage";
import { UserRepository } from "../../dal/repositories/repositories";
import { In } from "typeorm";

async function saveLarkMessage(params: LarkReceiveMessage) {
  const mongoMessage: LarkUserMessageMetaInfo = {
    message_id: params.message.message_id,
    root_id: params.message.root_id ?? params.message.message_id,
    parent_id: params.message.parent_id,
    thread_id: params.message.thread_id,
    chat_id: params.message.chat_id,
    chat_type: params.message.chat_type,
    message_content: params.message.content,
    create_time: dayjs(Number(params.message.create_time)).toDate(),
    is_delete: false,
    is_from_robot: false,
    mentions: params.message.mentions || [],
    message_type: params.message.message_type,
    sender: params.sender.sender_id?.union_id!,
    update_time: dayjs(Number(params.message.create_time)).toDate(),
  };

  await saveMessage(mongoMessage);
}

async function saveRobotMessage(
  message: CommonMessage,
  messageId: string,
  cardId: string
) {
  const mongoMessage: LarkRobotMessageMetaInfo = {
    message_id: messageId,
    root_id: message.rootId,
    parent_id: message.messageId,
    thread_id: message.threadId,
    chat_id: message.chatId,
    chat_type: message.chatType,
    create_time: dayjs().toDate(),
    is_delete: false,
    is_from_robot: true,
    message_type: "interactive",
    update_time: dayjs().toDate(),
    card_id: cardId,
  };

  await saveMessage(mongoMessage);
}

export async function handleMessageReceive(params: LarkReceiveMessage) {
  await saveLarkMessage(params);

  const factory = MessageFactory.create(params);
  const commonMessage = factory.build();

  if (!commonMessage) {
    console.error("Unsupported message type or failed to build message.");
    return;
  }

  if (
    commonMessage.isTextMessage() &&
    (commonMessage.isP2P() ||
      commonMessage.hasMention(process.env.ROBOT_OPEN_ID!)) // TODO: 这里需要适配多bot
  ) {
    await makeCardReply(commonMessage);
  }
}

async function makeCardReply(commonMessage: CommonMessage) {
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
    const userInfos = await UserRepository.findBy({union_id: In(userIds)})
    const userMap = new Map(userInfos.map(user => [user.union_id, user.name]));
    contextMessages.forEach(msg => {
      if (msg.isRobotMessage) {
        msg.senderName = "赤尾小助手";
      } else {
        msg.senderName = userMap.get(msg.sender) || undefined;
      }
    })
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
  // const model = "gpt-4o-mini";
  const model = "nemo";

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
