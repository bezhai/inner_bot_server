import { LarkReceiveMessage } from "../../types/lark";
import { runRules } from "../chat/matchRule";
import { saveLarkMessage } from "../messageStore/service";
import { MessageFactory } from "./factory";

export async function handleMessageReceive(params: LarkReceiveMessage) {
  const [_, commonMessage] = await Promise.all([
    saveLarkMessage(params), // 保存消息
    (async () => {
      const factory = MessageFactory.create(params);
      return await factory.build(); // 构建消息
    })(),
  ]);

  if (!commonMessage) {
    console.error("Unsupported message type or failed to build message.");
    return;
  }

  await runRules(commonMessage);
}