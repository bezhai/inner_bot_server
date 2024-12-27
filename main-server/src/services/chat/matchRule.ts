import { LarkBaseChatInfo } from "../../dal/entities";
import { CommonMessage } from "../../types/receiveMessage";
import { getBotUnionId } from "../../utils/botVar";
import { replyTemplate } from "../larkBasic/message";
import { deleteBotMessage } from "./rules/deleteMessage";
import { changeRepeatStatus, repeatMessage } from "./rules/repeatMessage";
import { makeCardReply } from "./rules/replyHandler";

// 定义规则函数类型
type Rule = (message: CommonMessage) => boolean;

// 定义权限函数类型
type Handler = (message: CommonMessage) => Promise<void>;

// 定义规则和对应处理逻辑的结构
interface RuleConfig {
  rules: Rule[];
  handler: Handler;
  fallthrough?: boolean;
}

// 工具函数：通用规则
const NeedRobotMention: Rule = (message) =>
  message.hasMention(getBotUnionId()) || message.isP2P();

const TextMessageLimit: Rule = (message) => message.isTextMessage();

const ContainKeyword =
  (keyword: string): Rule =>
  (message) =>
    message.text().includes(keyword);

const RegexpMatch =
  (pattern: string): Rule =>
  (message) => {
    try {
      return new RegExp(pattern).test(message.text());
    } catch {
      return false;
    }
  };

const OnlyP2P: Rule = (message) => message.isP2P();

const OnlyGroup: Rule = (message) => !message.isP2P();

const WhiteGroupCheck =
  (checkFunc: (chatInfo: LarkBaseChatInfo) => boolean): Rule =>
  (message) => {
    const chatInfo = message.basicChatInfo;
    return chatInfo ? checkFunc(chatInfo) : false;
  };

const IsAdmin: Rule = (message) => message.senderInfo?.is_admin ?? false;

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
  },
  {
    rules: [ContainKeyword("帮助"), TextMessageLimit, NeedRobotMention],
    handler: async (message) => {
      replyTemplate(message.messageId, "ctp_AAYrltZoypBP", undefined);
    },
  },
  {
    rules: [ContainKeyword("撤回"), TextMessageLimit, NeedRobotMention],
    handler: deleteBotMessage,
  },
  {
    rules: [ContainKeyword("开启复读"), TextMessageLimit, NeedRobotMention, OnlyGroup],
    handler: changeRepeatStatus(true),
  },
  {
    rules: [ContainKeyword("关闭复读"), TextMessageLimit, NeedRobotMention, OnlyGroup],
    handler: changeRepeatStatus(false),
  },
  {
    rules: [TextMessageLimit, NeedRobotMention],
    handler: makeCardReply,
  },
];
