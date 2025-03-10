import { ChatModelMappingRepository, ChatPromptMappingRepository } from '../../dal/repositories/repositories';
import { LarkCallbackInfo, SetLLMConfigFormValue } from '../../types/lark';

export async function handleSetLLMConfig(data: LarkCallbackInfo, fromValue: SetLLMConfigFormValue) {
  const { select_model, select_prompt } = fromValue;
  const chatId = data.context.open_chat_id;

  // TODO: 需要加鉴权

  // 更新模型配置
  await Promise.all([
    ChatModelMappingRepository.save({ chat_id: chatId, model_id: select_model }),
    ChatPromptMappingRepository.save({ chat_id: chatId, prompt_id: select_prompt }),
  ]);
}
