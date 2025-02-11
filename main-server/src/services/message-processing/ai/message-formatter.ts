import { Message as AIMessage, UserContent, UserMessage, SystemMessage } from '../../../types/ai';
import { Message } from '../../../models/message';
import Handlebars from 'handlebars';
import { getCurrentDateTime } from '../../../utils/date-time';
import { downloadResource } from '../../../dal/lark-client';
import { streamToBase64 } from '../../../utils/stream-utils';

export function formatMessages(
  messages: Message[],
  imageBase64Map: Map<string, string>,
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
        userMessage.content = `${msg.senderName ?? msg.sender}: ${msg.withMentionText()}`;
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
          if (imageBase64Map.has(imageKey)) {
            (userMessage.content as UserContent[]).push({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64Map.get(imageKey)!}`,
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

export async function getMessageImagesBase64(messages: Message[]): Promise<Map<string, string>> {
  const imageBase64Map = new Map<string, string>();

  const base64Requests = messages.flatMap((msg) => {
    return msg.imageKeys().map(async (imageKey) => {
      try {
        const resource = await downloadResource(msg.messageId, imageKey, 'image');
        const base64 = await streamToBase64(resource.getReadableStream());
        return { imageKey, base64 };
      } catch (error) {
        console.error(`Failed to get base64 for image ${imageKey}:`, error);
        return { imageKey, base64: '' };
      }
    });
  });

  const results = await Promise.allSettled(base64Requests);

  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.base64) {
      imageBase64Map.set(result.value.imageKey, result.value.base64);
    }
  });

  return imageBase64Map;
}
