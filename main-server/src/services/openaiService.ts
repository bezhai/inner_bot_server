import Handlebars from "handlebars";
import { AssistantMessage, Message } from "../types/ai";
import { CommonMessage } from "../types/receiveMessage";
import { getCompletion, UpdateTextFunction } from "./aiService";
import dayjs from "dayjs";
import { get } from "../dal/redis";

export async function replyText(
  model: string,
  text: CommonMessage[],
  streamUpdateAPI: UpdateTextFunction,
  nonStreamUpdateAPI: UpdateTextFunction,
  endOfReply?: (fullText: string) => void
) {
  const userNameList: string[] = []; // TODO: 这里暂时使用数组标识用户, 需要优化

  const customMessages: Message[] = text.map((msg) => {
    if (msg.isRobotMessage) {
      return {
        role: "assistant",
        content: msg.text() === "抱歉，我无法满足这个请求。" ? "好的" : msg.text(),
      };
    } else {

      if (!userNameList.includes(msg.sender)) {
        userNameList.push(msg.sender);
      }

      return {
        role: "user",
        content: `${msg.senderName}: ${msg.clearText()}`,
        name: `user${userNameList.indexOf(msg.sender) + 1}`,
        // content: msg.clearText(),
      };
    }
  });

  customMessages.reverse();

  const defaultPrompt = await get("default_prompt");
  const compiled = Handlebars.compile(defaultPrompt);

  const currDate = dayjs().add(8, "hour").format("YYYY年MM月DD日"); // 这里手动调一下东八区
  const currTime = dayjs().add(8, "hour").format("HH点mm分");

  await getCompletion(
    {
      model,
      messages: [
        { role: "system", content: compiled({ currDate, currTime }) },
        ...customMessages,
      ],
      temperature: 0.8,
      presence_penalty: 1.8,
      stream: true,
    },
    streamUpdateAPI,
    nonStreamUpdateAPI,
    endOfReply
  );
}
