import * as Lark from "@larksuiteoapi/node-sdk";
import { handleMessageReceive } from "./receive";
import { handleMessageRecalled } from "./recalled";
import { handleChatMemberAdd, handleChatMemberRemove, handleChatRobotAdd, handleChatRobotRemove } from "./group";
import { getBotAppId, getBotAppSecret, getEncryptKey, getVerificationToken } from "../../utils/botVar";

const wsClient = new Lark.WSClient({
  appId: getBotAppId(),
  appSecret: getBotAppSecret(),
  loggerLevel: Lark.LoggerLevel.info,
});

function createVoidDecorator<T>(
  asyncFn: (params: T) => Promise<void>
): (params: T) => void {
  return function (params: T): void {
    // 异步调用原函数，但不等待结果
    asyncFn(params).catch((err) => {
      console.error("Error in async operation:", err);
    });
  };
}

export function startLarkWebSocket() {
  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({
      verificationToken: getVerificationToken(),
      encryptKey: getEncryptKey(),
    }).register({
      "im.message.receive_v1": createVoidDecorator(handleMessageReceive),
      "im.message.recalled_v1": createVoidDecorator(handleMessageRecalled),
      "im.chat.member.user.added_v1": createVoidDecorator(handleChatMemberAdd),
      "im.chat.member.user.deleted_v1": createVoidDecorator(handleChatMemberRemove),
      "im.chat.member.user.withdrawn_v1": createVoidDecorator(handleChatMemberRemove),
      "im.chat.member.bot.added_v1": createVoidDecorator(handleChatRobotAdd),
      "im.chat.member.bot.deleted_v1": createVoidDecorator(handleChatRobotRemove),
    }),
  });

  console.log("Feishu WebSocket client started.");
}
