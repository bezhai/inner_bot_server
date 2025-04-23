import { Message } from '../../models/message';
import { replyTemplate } from '../lark/basic/message';
import { CommandHandler, CommandRule } from './rules/admin/command-handler';
import { deleteBotMessage } from './rules/admin/delete-message';
import { genHistoryCard } from './rules/general/gen-history';
import { checkMeme, genMeme } from '../media/meme/meme';
import { changeRepeatStatus, repeatMessage } from './rules/group/repeat-message';
import { makeCardReply } from './rules/general/reply-workflow';
import {
    ContainKeyword,
    NeedRobotMention,
    OnlyGroup,
    RegexpMatch,
    RuleConfig,
    TextMessageLimit,
    WhiteGroupCheck,
} from './rules/rule';
import { sendPhoto } from '../media/photo/send-photo';
import { setAIConfig } from './rules/setting/setting';

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
        rules: [OnlyGroup, WhiteGroupCheck((chatInfo) => chatInfo.open_repeat_message ?? false)],
        handler: repeatMessage,
        fallthrough: true,
        comment: '复读功能',
    },
    {
        rules: [ContainKeyword('帮助'), TextMessageLimit, NeedRobotMention],
        handler: async (message) => {
            replyTemplate(message.messageId, 'ctp_AAYrltZoypBP', undefined);
        },
        comment: '给用户发送帮助信息',
    },
    {
        rules: [ContainKeyword('撤回'), TextMessageLimit, NeedRobotMention],
        handler: deleteBotMessage,
        comment: '撤回消息',
    },
    {
        rules: [ContainKeyword('水群'), TextMessageLimit, NeedRobotMention],
        handler: genHistoryCard,
        comment: '生成水群历史卡片',
    },
    {
        rules: [ContainKeyword('开启复读'), TextMessageLimit, NeedRobotMention, OnlyGroup],
        handler: changeRepeatStatus(true),
    },
    {
        rules: [ContainKeyword('关闭复读'), TextMessageLimit, NeedRobotMention, OnlyGroup],
        handler: changeRepeatStatus(false),
    },
    {
        rules: [ContainKeyword('模型配置'), TextMessageLimit, NeedRobotMention],
        handler: setAIConfig,
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
        rules: [NeedRobotMention],
        handler: makeCardReply,
        comment: '聊天',
    },
];
