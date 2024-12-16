import * as Lark from "@larksuiteoapi/node-sdk";
import { handleMessageReceive } from "./larkEvent/messageReceive";
import { handleMessageRecalled } from "./larkEvent/messageRecalled";

const wsClient = new Lark.WSClient({
  appId: process.env.APP_ID!,
  appSecret: process.env.APP_SECRET!,
  loggerLevel: Lark.LoggerLevel.info,
});

function createVoidDecorator<T>(
  asyncFn: (params: T) => Promise<void>
): (params: T) => void {
  return function (params: T): void {
    // 异步调用原函数，但不等待结果
    asyncFn(params)
      .catch((err) => {
        console.error("Error in async operation:", err);
      });
  };
}

export function startLarkWebSocket() {
  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({
      verificationToken: process.env.VERIFICATION_TOKEN!,
      encryptKey: process.env.ENCRYPT_KEY!,
    }).register({
      "im.message.receive_v1": createVoidDecorator(handleMessageReceive),
      "im.message.recalled_v1": createVoidDecorator(handleMessageRecalled),
    }),
  });

  console.log("Feishu WebSocket client started.");
}
