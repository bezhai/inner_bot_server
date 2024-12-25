import { deleteMessage, getMessageInfo } from "../../../dal/larkClient";
import { CommonMessage } from "../../../types/receiveMessage";
import { getBotUnionId } from "../../../utils/botVar";
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

    if (parentMessage?.sender?.id !== getBotUnionId()) {
      throw new Error("只能撤回机器人自己发送的消息");
    }

    await deleteMessage(message.parentMessageId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "未知错误";
    console.error(e);
    replyMessage(message.messageId, `删除失败: ${errorMessage}`);
  }
}
