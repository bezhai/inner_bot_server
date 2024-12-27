import { CommonMessage } from "../../models/common-message";
import { replyTemplate } from "../larkBasic/message";
import { CommandHandler, CommandRule } from "./rules/command-handler";
import { deleteBotMessage } from "./rules/delete-message";
import { changeRepeatStatus, repeatMessage } from "./rules/repeat-message";
import { makeCardReply } from "./rules/reply-handler";
import {
  ContainKeyword,
  NeedRobotMention,
  OnlyGroup,
  RuleConfig,
  TextMessageLimit,
  WhiteGroupCheck,
} from "./rules/rule";

// 工具函数：执行规则链
export async function runRules(message: CommonMessage) {
  for (const { rules, handler, fallthrough } of chatRules) {
    if (rules.every((rule) => rule(message))) {
      await handler(message);
      if (!fallthrough) break;
    }
  }
}

// 定义规则和对应处理逻辑
const chatRules: RuleConfig[] = [
  {
    rules: [
      OnlyGroup,
      WhiteGroupCheck((chatInfo) => chatInfo.open_repeat_message ?? false),
    ],
    handler: repeatMessage,
    fallthrough: true,
    comment: "复读功能",
  },
  {
    rules: [ContainKeyword("帮助"), TextMessageLimit, NeedRobotMention],
    handler: async (message) => {
      replyTemplate(message.messageId, "ctp_AAYrltZoypBP", undefined);
    },
    comment: "给用户发送帮助信息",
  },
  {
    rules: [ContainKeyword("撤回"), TextMessageLimit, NeedRobotMention],
    handler: deleteBotMessage,
    comment: "撤回消息",
  },
  {
    rules: [
      ContainKeyword("开启复读"),
      TextMessageLimit,
      NeedRobotMention,
      OnlyGroup,
    ],
    handler: changeRepeatStatus(true),
  },
  {
    rules: [
      ContainKeyword("关闭复读"),
      TextMessageLimit,
      NeedRobotMention,
      OnlyGroup,
    ],
    handler: changeRepeatStatus(false),
  },
  {
    rules: [CommandRule, TextMessageLimit, NeedRobotMention],
    handler: CommandHandler,
    comment: "指令处理",
  },
  {
    rules: [TextMessageLimit, NeedRobotMention],
    handler: makeCardReply,
    comment: "聊天",
  },
];
