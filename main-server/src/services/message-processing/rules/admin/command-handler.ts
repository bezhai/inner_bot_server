import { set } from '../../../../dal/redis';
import { UserGroupBindingRepository, GroupMemberRepository } from '../../../../dal/repositories/repositories';
import { Message } from '../../../../models/message';
import { getBotUnionId } from '../../../../utils/bot/bot-var';
import { replyMessage } from '../../../lark/basic/message';
import { fetchAvailableModels } from '../../ai/http-client';
import { combineRule, RegexpMatch } from '../rule';
import { getUserInfo } from '../../../../dal/lark-client';

const commandRules = [
  {
    key: 'chat_id',
    handler: async (message: Message) => {
      replyMessage(message.messageId, message.chatId, true);
    },
  },
  {
    key: 'message_id',
    handler: async (message: Message) => {
      if (message.parentMessageId) {
        replyMessage(message.messageId, message.parentMessageId, true);
      } else {
        replyMessage(message.messageId, '消息不存在', true);
      }
    },
  },
  {
    key: 'bind',
    handler: async (message: Message) => {
      const mentionUser = message.getMentionedUsers().find((user) => user !== getBotUnionId());

      if (!mentionUser) {
        replyMessage(message.messageId, '请@具体用户进行绑定', true);
        return;
      }

      try {
        await getUserInfo(mentionUser);
      } catch (e) {
        replyMessage(message.messageId, (e as Error).message, true);
        return;
      }

      const member = await GroupMemberRepository.findOne({
        where: {
          chat_id: message.chatId,
          union_id: mentionUser,
          is_leave: false,
        },
      });

      if (!member) {
        replyMessage(message.messageId, '该用户不在群中，无法绑定', true);
        return;
      }

      await UserGroupBindingRepository.createBinding(mentionUser, message.chatId);

      replyMessage(message.messageId, `绑定成功，该用户退群后将被自动重新拉回群聊`, true);
    },
  },
  {
    key: 'unbind',
    handler: async (message: Message) => {
      const mentionUser = message.getMentionedUsers().find((user) => user !== getBotUnionId());

      if (!mentionUser) {
        replyMessage(message.messageId, '请@具体用户进行解绑', true);
        return;
      }

      await UserGroupBindingRepository.deactivateBinding(mentionUser, message.chatId);

      replyMessage(message.messageId, `解绑成功，该用户退群后将不会被自动拉回群聊`, true);
    },
  },
  {
    key: 'model',
    handler: async (message: Message) => {
      if (!message.senderInfo?.is_admin) {
        replyMessage(message.messageId, '当前用户无权限', true);
        return;
      }

      const model = new RegExp(`^/model ([\\w-.]+)`).exec(message.clearText())?.[1];

      if (!model) {
        replyMessage(message.messageId, '参数错误', true);
        return;
      }

      const models = await fetchAvailableModels();

      if (!models.includes(model)) {
        replyMessage(message.messageId, '模型不存在', true);
        return;
      }

      set(`lark_chat_model:${message.chatId}`, model)
        .then(() => {
          replyMessage(message.messageId, `模型已切换为${model}`, true);
        })
        .catch(() => {
          replyMessage(message.messageId, '切换模型失败', true);
        });
    },
  },
];

export const { rule: CommandRule, handler: CommandHandler } = combineRule<string>(
  commandRules,
  (key) => (message) => RegexpMatch(`^/${key}`)(message),
);
