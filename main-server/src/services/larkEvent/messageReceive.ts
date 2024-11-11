import { LarkReceiveMessage } from "../../types/lark";
import { sendMsg } from "../larkClient";
import { replyText } from "../openaiService";

export async function handleMessageReceive(params: LarkReceiveMessage) {

  console.log(params.message);

  if (params.message.message_type === "text") {
    const content: {text: string} = JSON.parse(params.message.content);
    const replyMessage = await replyText(content.text);
    if (replyMessage) {
        await sendMsg(params.message.chat_id, replyMessage);
    }
  }
}
