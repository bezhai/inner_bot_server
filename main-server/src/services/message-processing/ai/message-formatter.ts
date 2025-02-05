import { Message as AIMessage, UserContent, UserMessage, SystemMessage, AssistantMessage } from '../../../types/ai';
import { Message } from '../../../models/message';
import { MessageMetadata } from '../../../models/message-metadata';
import Handlebars from 'handlebars';
import { getCurrentDateTime } from '../../../utils/date-time';
import { getLarkFileTransferUrl } from '../../integrations/aliyun/proxy';

export function formatMessages(
  messages: Message[],
  imageKeyMap: Map<string, string>,
  systemPrompt?: string,
): AIMessage[] {
  const userNameList: string[] = [];
  const formattedMessages: AIMessage[] = messages.map((msg) => {
    if (msg.isRobotMessage) {
      return {
        role: 'assistant',
        content: msg.text(),
      };
    } else {
      if (!userNameList.includes(msg.sender)) {
        userNameList.push(msg.sender);
      }

      const userMessage: UserMessage = {
        role: 'user',
        content: '',
        name: `user${userNameList.indexOf(msg.sender) + 1}`,
      };

      if (msg.isTextOnly()) {
        userMessage.content = `${msg.senderName ?? msg.sender}: ${msg.clearText()}`;
      } else {
        // Multi-modal message
        userMessage.content = [];

        // Add text content
        const texts = msg.texts();
        if (texts.length > 0) {
          texts.forEach((text) => {
            (userMessage.content as UserContent[]).push({
              type: 'text',
              text,
            });
          });
        }

        // Add image content
        const images = msg.imageKeys();
        images.forEach((imageKey) => {
          if (imageKeyMap.has(imageKey)) {
            (userMessage.content as UserContent[]).push({
              type: 'image_url',
              image_url: {
                url: imageKeyMap.get(imageKey)!,
              },
            });
          }
        });
      }

      return userMessage;
    }
  });

  formattedMessages.reverse();

  if (systemPrompt) {
    const { date, time } = getCurrentDateTime();
    const compiled = Handlebars.compile(systemPrompt);
    const systemMessage: SystemMessage = {
      role: 'system',
      content: compiled({ currDate: date, currTime: time }),
    };
    formattedMessages.unshift(systemMessage);
  }

  return formattedMessages;
}

export async function uploadMessageImages(messages: Message[]): Promise<Map<string, string>> {
  const imageKeyMap = new Map<string, string>();

  const transferRequests = messages.flatMap((msg) => {
    return msg.imageKeys().map((imageKey) => {
      return {
        file_key: imageKey,
        message_id: msg.messageId,
        destination: '302ai',
      };
    });
  });

  const transferResponses = await Promise.allSettled(
    transferRequests.map((req) => {
      return getLarkFileTransferUrl(req);
    }),
  );

  transferResponses.forEach((resp) => {
    if (resp.status === 'fulfilled') {
      imageKeyMap.set(resp.value.file_key, resp.value.url);
    }
  });
  return imageKeyMap;
}
