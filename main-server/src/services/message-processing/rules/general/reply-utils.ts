import { In } from 'typeorm';
import { UserRepository } from '../../../../dal/repositories/repositories';
import { CommonMessage } from '../../../../models/common-message';
import { CompletionRequest } from '../../../../types/ai';
import { get } from '../../../../dal/redis';
import { searchMessageByRootId } from '../../../message-store/basic';

export async function prepareContextMessages(commonMessage: CommonMessage) {
  const mongoMessages = await searchMessageByRootId(commonMessage.rootId!);
  const contextMessages = mongoMessages.map((msg) => CommonMessage.fromMessage(msg));

  const userIds = contextMessages.filter((msg) => !msg.isRobotMessage).map((msg) => msg.sender);

  if (userIds.length > 0) {
    const userInfos = await UserRepository.findBy({ union_id: In(userIds) });
    const userMap = new Map(userInfos.map((user) => [user.union_id, user.name]));

    contextMessages.forEach((msg) => {
      msg.senderName = msg.isRobotMessage ? '赤尾小助手' : userMap.get(msg.sender);
    });
  }

  return contextMessages;
}

export async function fetchChatConfig(chatId: string) {
  const [chatModel, defaultPrompt, chatPrompt, modelParams] = await Promise.all([
    get(`lark_chat_model:${chatId}`),
    get('default_prompt'),
    get(`lark_chat_prompt:${chatId}`),
    get('model_params'),
  ]);

  return {
    model: chatModel ?? 'qwen-plus',
    prompt: chatPrompt ?? defaultPrompt ?? '',
    params: JSON.parse(modelParams ?? '{}') as Partial<CompletionRequest>,
  };
}
