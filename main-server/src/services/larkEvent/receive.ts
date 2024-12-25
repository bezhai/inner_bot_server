import { LarkReceiveMessage } from "../../types/lark";
import { makeCardReply } from "../chat/replyHandler";
import { saveLarkMessage } from "../messageStore/service";
import { MessageFactory } from "./factory";

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
