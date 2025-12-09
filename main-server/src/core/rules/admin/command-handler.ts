import { UserGroupBindingRepository, GroupMemberRepository, BaseChatInfoRepository } from '@infrastructure/dal/repositories/repositories';
import { Message } from '@core/models/message';
import { getBotUnionId } from '@core/services/bot/bot-var';
import { replyMessage } from '@lark/basic/message';
import { combineRule, RegexpMatch } from '@core/rules/rule';
import { getUserInfo } from '@lark-client';

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
            const mentionUser = message
                .getMentionedUsers()
                .find((user) => user !== getBotUnionId());

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

            const binding = await UserGroupBindingRepository.findByUserAndChat(
                            mentionUser,
                            message.chatId,
                        );
            if (binding && binding.isActive) {
                replyMessage(message.messageId, '该用户已绑定，无需重复绑定', true);
                return;
            } else if (binding && !binding.isActive) {
                await UserGroupBindingRepository.activateBinding(mentionUser, message.chatId);
                replyMessage(message.messageId, `绑定成功，该用户退群后将被自动重新拉回群聊`, true);
                return;
            }

            await UserGroupBindingRepository.createBinding(mentionUser, message.chatId);

            replyMessage(message.messageId, `绑定成功，该用户退群后将被自动重新拉回群聊`, true);
        },
    },
    {
        key: 'unbind',
        handler: async (message: Message) => {
            const mentionUser = message
                .getMentionedUsers()
                .find((user) => user !== getBotUnionId());

            if (!mentionUser) {
                replyMessage(message.messageId, '请@具体用户进行解绑', true);
                return;
            }

            const binding = await UserGroupBindingRepository.findByUserAndChat(
                            mentionUser,
                            message.chatId,
                        );
            if (!binding || !binding.isActive) {
                replyMessage(message.messageId, '该用户未绑定，无需解绑', true);
                return;
            }

            await UserGroupBindingRepository.deactivateBinding(mentionUser, message.chatId);

            replyMessage(message.messageId, `解绑成功，该用户退群后将不会被自动拉回群聊`, true);
        },
    },
    {
        key: 'config',
        handler: async (message: Message) => {
            // 检查是否是管理员
            if (!message.senderInfo?.is_admin) {
                replyMessage(message.messageId, '只有管理员可以设置灰度配置', true);
                return;
            }

            // 解析命令: /config [xxx] set [yyy]
            const configMatch = message.text().match(/^\/config\s+(\S+)\s+set\s+(\S+)$/);

            if (!configMatch) {
                replyMessage(message.messageId, '命令格式错误，正确格式: /config [key] set [value]（key和value不能包含空格）', true);
                return;
            }

            const [, key, value] = configMatch;

            // 获取当前聊天的基本信息
            const chatInfo = await BaseChatInfoRepository.findOne({
                where: { chat_id: message.chatId },
            });

            if (!chatInfo) {
                replyMessage(message.messageId, '未找到群聊信息', true);
                return;
            }

            // 更新 gray_config
            const grayConfig = chatInfo.gray_config || {};
            grayConfig[key] = value;

            await BaseChatInfoRepository.update(
                { chat_id: message.chatId },
                { gray_config: grayConfig },
            );

            replyMessage(message.messageId, `灰度配置设置成功: ${key} = ${value}`, true);
        },
    },
];

export const { rule: CommandRule, handler: CommandHandler } = combineRule<string>(
    commandRules,
    (key) => (message) => RegexpMatch(`^/${key}`)(message),
);
