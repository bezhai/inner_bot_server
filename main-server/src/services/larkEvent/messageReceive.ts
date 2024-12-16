import {
  Config,
  LarkV2Card,
  MarkdownComponent,
  StreamConfig,
  Summary,
  withElementId,
} from "feishu-card";
import { LarkReceiveMessage } from "../../types/lark";
import { V2card } from "../larkClient/card";
import { replyText } from "../openaiService";
import { MessageFactory } from "./messageFactory";
import { replyMessage } from "../larkClient/message";
import { get, set } from "../../config/redis";
import { LarkRobotMessageMetaInfo, LarkUserMessageMetaInfo } from "../../types/mongo";
import dayjs from "dayjs";
import { saveMessage, updateRobotMessageText } from "../messageStore/store";
import { CommonMessage } from "../../types/receiveMessage";

async function saveLarkMessage(params: LarkReceiveMessage) {
  const mongoMessage: LarkUserMessageMetaInfo = {
    message_id: params.message.message_id,
    root_id: params.message.root_id,
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
    sender: params.sender.sender_id?.user_id!,
    update_time: dayjs(Number(params.message.create_time)).toDate(),
  };

  await saveMessage(mongoMessage);
}

async function saveRobotMessage(message: CommonMessage, messageId: string, cardId: string) {
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
  }

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

  console.log(commonMessage);

  if (
    commonMessage.isTextMessage() &&
    (commonMessage.isP2P() ||
      commonMessage.hasMention(process.env.ROBOT_OPEN_ID!))
  ) {
    await makeCardReply(commonMessage);
  }
}

async function makeCardReply(commonMessage: CommonMessage) {
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

  await saveRobotMessage(commonMessage, v2Card.getMessageId()!, v2Card.getCardId()!);

  const streamSendMsg = async (text: string) => {
    await v2Card.streamUpdateText("md", text);
  };

  const endOfReply = async (fullText: string) => {
    Promise.allSettled([
      v2Card.closeUpdate(fullText),
      updateRobotMessageText(
        v2Card.getMessageId()!,
        fullText
      ),
    ]);
  };

  const model = "gpt-4o-mini-2024-07-18";

  await replyText(
    model,
    commonMessage.clearText(),
    streamSendMsg,
    streamSendMsg,
    endOfReply
  );
}
