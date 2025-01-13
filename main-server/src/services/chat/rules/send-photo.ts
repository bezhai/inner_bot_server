import { replyCard, replyMessage } from "../../larkBasic/message";
import { CommonMessage } from "../../../models/common-message";
import { searchAndBuildPhotoCard } from "../../commonAction/photo-card";

export async function sendPhoto(message: CommonMessage) {
  try {
    const tags = message
      .clearText()
      .replace(/^发图/, "")
      .trim()
      .split(/\s+/)
      .filter((tag) => tag.length > 0);
    if (tags.length <= 0) {
      throw new Error("标签格式错误");
    }

    const photoCard = await searchAndBuildPhotoCard(
      tags,
      message.basicChatInfo?.allow_send_limit_photo
    );

    await replyCard(message.messageId, photoCard);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "未知错误";
    console.error(e);
    replyMessage(message.messageId, `发送图片失败: ${errorMessage}`, true);
  }
}
