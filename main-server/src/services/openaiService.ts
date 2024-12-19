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
  const customMessages: Message[] = text.map((msg) => {
    if (msg.isRobotMessage) {
      return {
        role: "assistant",
        content: msg.text(),
        // name: "赤尾小助手",
      };
    } else {
      return {
        role: "user",
        content: msg.clearText(),
        name: "Jack",
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
