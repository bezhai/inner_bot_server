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

function extractBindValue(input: string): string | null {
  return input.match(/\/bind (\S+)/)?.[1] || null;
}

export async function handleMessageReceive(params: LarkReceiveMessage) {
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
    const clearText = commonMessage.clearText();
    if (extractBindValue(clearText)) {
      const model = extractBindValue(clearText)!;

      if (commonMessage.sender !== process.env.ADMIN_USER_ID) {
        await replyMessage(commonMessage.messageId, "没有权限");
        return;
      }

      await set(`bind_${commonMessage.chatId}`, model);

      await replyMessage(commonMessage.messageId, `设置模型[${model}]成功`);
      return;
    }

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

    const streamSendMsg = async (text: string) => {
      await v2Card.streamUpdateText("md", text);
    };

    const endOfReply = async (fullText: string) => {
      await v2Card.closeUpdate(fullText);
    };

    const model = await get(`bind_${commonMessage.chatId}`) || "qwen-plus";

    console.log("model", model);

    await replyText(
      model,
      commonMessage.clearText(),
      streamSendMsg,
      streamSendMsg,
      endOfReply
    );
  }
}
