import { Message } from 'models/message';
import { replyMessage, replyTemplate } from '@lark-basic/message';
import { CommandHandler, CommandRule } from './rules/admin/command-handler';
import { deleteBotMessage } from './rules/admin/delete-message';
import { genHistoryCard } from './rules/general/gen-history';
import { checkMeme, genMeme } from 'services/media/meme/meme';
import { changeRepeatStatus, repeatMessage } from './rules/group/repeat-message';
import {
    ContainKeyword,
    EqualText,
    NeedNotRobotMention,
    NeedRobotMention,
    OnlyGroup,
    RegexpMatch,
    RuleConfig,
    TextMessageLimit,
    WhiteGroupCheck,
} from './rules/rule';
import { sendPhoto } from 'services/media/photo/send-photo';
import { checkDuplicate } from './rules/general/check-duplicate';
import { makeCardReply } from 'services/ai/reply';
import { getBotUnionId } from '@/utils/bot/bot-var';

// 工具函数：执行规则链
export async function runRules(message: Message) {
    for (const { rules, handler, fallthrough, async_rules } of chatRules) {
        // 检查同步规则
        const syncRulesPass = rules.every((rule) => rule(message));

        // 检查异步规则
        const asyncRulesPass = async_rules
            ? (await Promise.all(async_rules.map((rule) => rule(message)))).every(
                  (result) => result,
              )
            : true;

        // 如果所有规则（同步和异步）都通过
        if (syncRulesPass && asyncRulesPass) {
            try {
                await handler(message);
            } catch (e) {
                console.error(e);
            }

            if (!fallthrough) break;
        }
    }
}

// 定义规则和对应处理逻辑
const chatRules: RuleConfig[] = [
    {
        rules: [
            NeedNotRobotMention,
            OnlyGroup,
            WhiteGroupCheck((chatInfo) => chatInfo.permission_config?.open_repeat_message ?? false),
        ],
        handler: repeatMessage,
        fallthrough: true,
        comment: '复读功能',
    },
    {
        rules: [EqualText('帮助'), TextMessageLimit, NeedRobotMention],
        handler: async (message) => {
            replyTemplate(message.messageId, 'ctp_AAYrltZoypBP', undefined);
        },
        comment: '给用户发送帮助信息',
    },
    {
        rules: [EqualText('撤回'), TextMessageLimit, NeedRobotMention],
        handler: deleteBotMessage,
        comment: '撤回消息',
    },
    {
        rules: [ContainKeyword('水群'), TextMessageLimit, NeedRobotMention],
        handler: genHistoryCard,
        comment: '生成水群历史卡片',
    },
    {
        rules: [EqualText('开启复读'), TextMessageLimit, NeedRobotMention, OnlyGroup],
        handler: changeRepeatStatus(true),
    },
    {
        rules: [EqualText('关闭复读'), TextMessageLimit, NeedRobotMention, OnlyGroup],
        handler: changeRepeatStatus(false),
    },
    {
        rules: [EqualText('模型配置'), TextMessageLimit, NeedRobotMention],
        handler: async (message) => {
            replyMessage(message.messageId, '功能已下线');
        },
    },
    {
        rules: [EqualText('查重'), TextMessageLimit, NeedRobotMention],
        handler: checkDuplicate,
        comment: '消息查重功能',
    },
    {
        rules: [CommandRule, TextMessageLimit, NeedRobotMention],
        handler: CommandHandler,
        comment: '指令处理',
    },
    {
        rules: [RegexpMatch('^发图'), TextMessageLimit, NeedRobotMention],
        handler: sendPhoto,
        comment: '发送图片',
    },
    {
        rules: [NeedRobotMention],
        async_rules: [checkMeme],
        handler: genMeme,
        comment: 'Meme',
    },
    {
        rules: [],
        handler: async (message) => {
            // 暂时只开放给管理员和灰度群使用
            if (message.senderInfo?.is_admin || message.basicChatInfo?.permission_config?.allow_send_message) {
                makeCardReply(message);
            } else if (message.hasMention(getBotUnionId()) || message.isP2P()) {
                replyMessage(
                    message.messageId,
                    '呜呜，这个聊天功能正在维护中呢，还不能陪你聊天了……不过我会很快回来陪你的！请再等我一下下，好吗？(｡•́︿•̀｡)',
                );
            }
        },
        comment: '聊天',
    },
];
