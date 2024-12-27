import { CommonMessage } from "../../../models/common-message";
import { replyMessage } from "../../larkBasic/message";
import { combineRule, RegexpMatch } from "./rule";

const commandRules = [
  {
    key: "chat_id",
    handler: async (message: CommonMessage) => {
      replyMessage(message.messageId, message.chatId, true);
    },
  },
  {
    key: "message_id",
    handler: async (message: CommonMessage) => {
      if (message.parentMessageId) {
        replyMessage(message.messageId, message.parentMessageId, true);
      } else {
        replyMessage(message.messageId, "消息不存在", true);
      }
    },
  },
];

export const { rule: CommandRule, handler: CommandHandler } =
  combineRule<string>(
    commandRules,
    (key) => (message) => RegexpMatch(`^/${key}$`)(message)
  );