import AppDataSource from '../../ormconfig';
import { ChatModelMapping, ChatPromptMapping } from '../../dal/entities';
import { LarkCallbackInfo, SetLLMConfigFormValue } from '../../types/lark';
import { replyMessage } from '../lark/basic/message';
import { AIModelRepository, AIPromptRepository } from '../../dal/repositories/repositories';

export async function handleSetLLMConfig(data: LarkCallbackInfo, fromValue: SetLLMConfigFormValue) {
  const { select_model, select_prompt } = fromValue;
  const chatId = data.context.open_chat_id;

  // TODO: 需要加鉴权

  // ... existing code ...
  await AppDataSource.transaction(async (transactionalEntityManager) => {
    await transactionalEntityManager
      .getRepository(ChatModelMapping)
      .upsert({ chat_id: chatId, model_id: select_model }, { conflictPaths: ['chat_id'] });

    await transactionalEntityManager
      .getRepository(ChatPromptMapping)
      .upsert({ chat_id: chatId, prompt_id: select_prompt }, { conflictPaths: ['chat_id'] });
  });

  const model = await AIModelRepository.findOne({
    where: {
      model_id: select_model,
    },
  });

  const prompt = await AIPromptRepository.findOne({
    where: {
      prompt_id: select_prompt,
    },
  });

  replyMessage(data.context.open_message_id, `设置模型[${model?.name}]和提示词[${prompt?.name}]成功`);
}
