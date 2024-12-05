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

export async function handleMessageReceive(params: LarkReceiveMessage) {
  const factory = MessageFactory.create(params);
  const commonMessage = factory.build();

  if (!commonMessage) {
    console.error("Unsupported message type or failed to build message.");
    return;
  }

  console.log(commonMessage);

  // const nonStreamSendMsg = async (text: string) => {
  //   await sendPost(params.message.chat_id, {
  //     content: [
  //       [
  //         {
  //           tag: "md",
  //           text,
  //         },
  //       ],
  //     ],
  //   });
  // };

  if (
    commonMessage.isTextMessage() &&
    (commonMessage.isP2P() ||
      commonMessage.hasMention(process.env.ROBOT_OPEN_ID!))
  ) {
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

    await v2Card.send(params.message.chat_id);

    const streamSendMsg = async (text: string) => {
      await v2Card.streamUpdateText("md", text);
    };

    const endOfReply = async (fullText: string) => {
      await v2Card.closeUpdate(fullText);
    };

    await replyText(commonMessage.clearText(), streamSendMsg, streamSendMsg, endOfReply);
  }
}
