import { deleteMessage, getMessageInfo } from "../../../dal/lark-client";
import { CommonMessage } from "../../../models/common-message";
import { getBotAppId } from "../../../utils/bot-var";
import { replyMessage } from "../../larkBasic/message";

export async function deleteBotMessage(message: CommonMessage) {
  try {
    if (!message.parentMessageId) {
      throw new Error("没有父消息，无法撤回");
    }

    const parentMessageInfo = await getMessageInfo(message.parentMessageId);

    if (
      !parentMessageInfo.items ||
      parentMessageInfo.items.length === 0 ||
      !parentMessageInfo.items[0]
    ) {
      throw new Error("父消息为空，无法撤回");
    }

    const parentMessage = parentMessageInfo.items[0];

    if (parentMessage?.sender?.id !== getBotAppId()) { // 这里拿到的不是union_id, 而是app_id
      throw new Error("只能撤回机器人自己发送的消息");
    }

    await deleteMessage(message.parentMessageId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "未知错误";
    console.error(e);
    replyMessage(message.messageId, `撤回失败: ${errorMessage}`, true);
  }
}
