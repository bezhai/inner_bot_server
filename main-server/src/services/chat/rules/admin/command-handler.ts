import { set } from "../../../../dal/redis";
import { CommonMessage } from "../../../../models/common-message";
import { replyMessage } from "../../../lark/basic/message";
import { getModelList } from "../../core/ai-service";
import { combineRule, RegexpMatch } from "../rule";

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
  {
    key: "model",
    handler: async (message: CommonMessage) => {
      if (!message.senderInfo?.is_admin) {
        replyMessage(message.messageId, "当前用户无权限", true);
        return;
      }

      const model = new RegExp(`^/model ([\\w-.]+)`).exec(message.clearText())?.[1];

      if (!model) {
        replyMessage(message.messageId, "参数错误", true);
        return;
      }

      const models = await getModelList();

      if (!models.includes(model)) {
        replyMessage(message.messageId, "模型不存在", true);
        return;
      }

      set(`lark_chat_model:${message.chatId}`, model)
        .then(() => {
          replyMessage(message.messageId, `模型已切换为${model}`, true);
        })
        .catch(() => {
          replyMessage(message.messageId, "切换模型失败", true);
        });
    },
  },
];

export const { rule: CommandRule, handler: CommandHandler } =
  combineRule<string>(
    commandRules,
    (key) => (message) => RegexpMatch(`^/${key}`)(message)
  );
