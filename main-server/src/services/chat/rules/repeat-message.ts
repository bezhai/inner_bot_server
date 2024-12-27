import { createHash } from "crypto";
import { get, setWithExpire } from "../../../dal/redis";
import { replyMessage, sendMsg, sendSticker } from "../../larkBasic/message";
import { BaseChatInfoRepository } from "../../../dal/repositories/repositories";
import { CommonMessage } from "../../../models/common-message";

interface RepeatMsg {
  chatId: string;
  msg: string;
  repeatTime: number;
}

async function addRepeatMsgAndCheck(
  chatId: string,
  msg: string
): Promise<boolean> {
  // 消息体的 Redis 键名
  const redisKey = `repeat_msg:${chatId}`;

  // 对消息进行 MD5 哈希
  const hashedMsg = createHash("md5").update(msg).digest("hex");

  // 从 Redis 获取当前的消息记录
  const existingData = await get(redisKey);
  let msgBody: RepeatMsg;

  if (existingData) {
    // 如果 Redis 中已有记录，解析 JSON 数据
    msgBody = JSON.parse(existingData) as RepeatMsg;

    if (msgBody.msg === hashedMsg) {
      // 如果消息相同，增加重复次数
      msgBody.repeatTime++;
    } else {
      // 如果消息不同，重置为新的消息
      msgBody = {
        chatId,
        msg: hashedMsg,
        repeatTime: 1,
      };
    }
  } else {
    // 如果 Redis 中没有记录，初始化消息体
    msgBody = {
      chatId,
      msg: hashedMsg,
      repeatTime: 1,
    };
  }

  // 更新 Redis 数据，设置过期时间为 7 天
  await setWithExpire(redisKey, JSON.stringify(msgBody), 7 * 24 * 60 * 60);

  // 返回是否达到重复次数 3 的条件
  return msgBody.repeatTime === 3;
}

export async function repeatMessage(message: CommonMessage) {
  if (
    message.isTextMessage() &&
    (await addRepeatMsgAndCheck(message.chatId, message.withMentionText()))
  ) {
    sendMsg(message.chatId, message.withMentionText());
  } else if (
    message.isStickerMessage() &&
    (await addRepeatMsgAndCheck(message.chatId, message.sticker()))
  ) {
    sendSticker(message.chatId, message.sticker());
  }
}

export function changeRepeatStatus(
  open_repeat_message: boolean
): (message: CommonMessage) => Promise<void> {
  return async function (message: CommonMessage) {
    BaseChatInfoRepository.update(
      {
        chat_id: message.chatId,
      },
      {
        open_repeat_message,
      }
    )
      .then(() => {
        if (open_repeat_message) {
          replyMessage(
            message.messageId,
            `复读功能已开启，当群聊中连续出现相同的三次文本/表情消息，我就会复读`
          );
        } else {
          replyMessage(message.messageId, `复读功能已关闭`);
        }
      })
      .catch(() => replyMessage(message.messageId, `操作失败`, true));
  };
}
