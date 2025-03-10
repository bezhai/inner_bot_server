import { In } from 'typeorm';
import { UserRepository } from '../../../../dal/repositories/repositories';
import { Message } from '../../../../models/message';
import { CompletionRequest } from '../../../../types/ai';
import { get } from '../../../../dal/redis';
import { searchMessageByRootId } from '../../../message-store/basic';
import { getChatAIConfig } from '../../../message-processing/ai/ai-config-service';

export interface MessageContext {
  message: Message;
  senderName: string | undefined;
}

export async function prepareContextMessages(message: Message): Promise<Message[]> {
  const mongoMessages = await searchMessageByRootId(message.rootId!);

  const messages = mongoMessages.map((msg) => Message.fromMessage(msg));

  const userIds = messages.filter((msg) => !msg.isRobotMessage).map((msg) => msg.sender);

  if (userIds.length > 0) {
    const userInfos = await UserRepository.findBy({ union_id: In(userIds) });
    const userMap = new Map(userInfos.map((user) => [user.union_id, user.name]));

    // Create new messages with sender names in metadata
    return messages.map((msg) => {
      const metadata = {
        ...msg.toJSON().metadata,
        senderName: msg.isRobotMessage ? '赤尾小助手' : userMap.get(msg.sender),
      };
      return new Message(metadata, msg.toJSON().content);
    });
  }

  // Create new messages with default sender names
  return messages.map((msg) => {
    const metadata = {
      ...msg.toJSON().metadata,
      senderName: msg.isRobotMessage ? '赤尾小助手' : undefined,
    };
    return new Message(metadata, msg.toJSON().content);
  });
}

export async function fetchChatConfig(chatId: string) {
  try {
    // 首先尝试从数据库获取配置
    return await getChatAIConfig(chatId);
  } catch (error) {
    console.error('从数据库获取聊天配置失败，回退到Redis:', error);

    // 如果数据库查询失败，回退到Redis
    const [chatModel, defaultPrompt, chatPrompt, modelParams] = await Promise.all([
      get(`lark_chat_model:${chatId}`),
      get('default_prompt'),
      get(`lark_chat_prompt:${chatId}`),
      get('model_params'),
    ]);

    return {
      model: chatModel ?? 'gpt-4o-mini',
      prompt: chatPrompt ?? defaultPrompt ?? '',
      params: JSON.parse(modelParams ?? '{}') as Partial<CompletionRequest>,
    };
  }
}
