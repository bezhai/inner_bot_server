import { LarkReceiveMessage } from "../../types/lark";
import { sendMsg, sendPost } from "../larkClient";
import { replyText } from "../openaiService";
import { MessageFactory } from "./messageFactory";

export async function handleMessageReceive(params: LarkReceiveMessage) {
  const factory = MessageFactory.create(params);
  const commonMessage = factory.build();

  if (!commonMessage) {
    console.error("Unsupported message type or failed to build message.");
    return;
  }

  console.log(commonMessage);

  const nonStreamSendMsg = async (text: string) => {
    await sendPost(params.message.chat_id, {
      content: [
        [
          {
            tag: "md",
            text,
          },
        ],
      ],
    });
  };

  // 示例：处理文本消息
  if (
    commonMessage.isTextMessage() &&
    (commonMessage.isP2P() ||
      commonMessage.hasMention(process.env.ROBOT_OPEN_ID!))
  ) {
    await replyText(commonMessage.text(), nonStreamSendMsg, nonStreamSendMsg);
  }
}
