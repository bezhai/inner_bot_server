import { Message } from "../../../types/ai";
import { CommonMessage } from "../../../models/common-message";
import Handlebars from "handlebars";
import { getCurrentDateTime } from "../../../utils/date-time";

export function formatMessages(
  messages: CommonMessage[],
  systemPrompt?: string
): Message[] {
  const userNameList: string[] = [];
  const formattedMessages: Message[] = messages.map((msg) => {
    if (msg.isRobotMessage) {
      return {
        role: "assistant",
        content: msg.text(),
      };
    } else {
      if (!userNameList.includes(msg.sender)) {
        userNameList.push(msg.sender);
      }

      return {
        role: "user",
        content: `${msg.senderName}: ${msg.clearText()}`,
        name: `user${userNameList.indexOf(msg.sender) + 1}`,
      };
    }
  });

  formattedMessages.reverse();

  if (systemPrompt) {
    const { date, time } = getCurrentDateTime();
    const compiled = Handlebars.compile(systemPrompt);
    formattedMessages.unshift({
      role: "system",
      content: compiled({ currDate: date, currTime: time }),
    });
  }

  return formattedMessages;
}
