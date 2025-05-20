import {
    AIModelRepository,
    AIPromptRepository,
    BaseChatInfoRepository,
    ChatModelMappingRepository,
    ChatPromptMappingRepository,
} from '../../../dal/repositories/repositories';
import { CompletionRequest } from '../../../types/ai';

// 模型配置接口
export interface ModelConfig {
    model_id: string;
    name: string;
    description?: string;
    default_params?: Partial<CompletionRequest>;
    is_restricted: boolean;
    is_default: boolean;
}

// Prompt配置接口
export interface PromptConfig {
    prompt_id: string;
    name: string;
    content: string;
    description?: string;
    is_restricted: boolean;
    is_default: boolean;
}

// Chat配置接口
export interface ChatAIConfig {
    model: string;
    prompt: string;
    params: Partial<CompletionRequest>;
    prompt_id: string;
    model_id: string;
    enableWebSearch: boolean;
}

/**
 * 获取特定聊天可用的模型列表
 * @param chatId 聊天ID
 * @returns 可用模型列表
 */
export async function getAvailableModelsForChat(chatId: string): Promise<ModelConfig[]> {
    // 获取聊天信息
    const chatInfo = await BaseChatInfoRepository.findOne({ where: { chat_id: chatId } });

    // 查询条件
    const whereCondition: any = { is_active: true };

    // 如果聊天不能访问受限模型，则只返回非受限模型
    // 注意：当 can_access_restricted_models 为 null 或 undefined 时，默认为不能访问
    if (chatInfo?.can_access_restricted_models !== true) {
        whereCondition.is_restricted = false;
    }

    // 获取所有符合条件的模型
    const models = await AIModelRepository.find({ where: whereCondition });

    return models.map((model) => ({
        model_id: model.model_id,
        name: model.name,
        description: model.description,
        default_params: model.default_params as Partial<CompletionRequest>,
        is_restricted: model.is_restricted,
        is_default: model.is_default,
    }));
}

/**
 * 获取特定聊天可用的提示词列表
 * @param chatId 聊天ID
 * @returns 可用提示词列表
 */
export async function getAvailablePromptsForChat(chatId: string): Promise<PromptConfig[]> {
    // 获取聊天信息
    const chatInfo = await BaseChatInfoRepository.findOne({ where: { chat_id: chatId } });

    // 查询条件
    const whereCondition: any = { is_active: true };

    // 如果聊天不能访问受限提示词，则只返回非受限提示词
    // 注意：当 can_access_restricted_prompts 为 null 或 undefined 时，默认为不能访问
    if (chatInfo?.can_access_restricted_prompts !== true) {
        whereCondition.is_restricted = false;
    }

    // 获取所有符合条件的提示词
    const prompts = await AIPromptRepository.find({ where: whereCondition });

    return prompts.map((prompt) => ({
        prompt_id: prompt.prompt_id,
        name: prompt.name,
        content: prompt.content,
        description: prompt.description,
        is_restricted: prompt.is_restricted,
        is_default: prompt.is_default,
    }));
}

/**
 * 获取特定聊天的AI配置
 * @param chatId 聊天ID
 * @returns 聊天AI配置
 */
export async function getChatAIConfig(chatId: string): Promise<ChatAIConfig> {
    // 并行执行所有数据库查询
    const [modelMapping, promptMapping, defaultModel, defaultPrompt] = await Promise.all([
        // 获取聊天的模型映射
        ChatModelMappingRepository.findOne({
            where: { chat_id: chatId, is_active: true },
            relations: ['model'],
        }),

        // 获取聊天的提示词映射
        ChatPromptMappingRepository.findOne({
            where: { chat_id: chatId, is_active: true },
            relations: ['prompt'],
        }),

        // 获取默认模型
        AIModelRepository.findOne({
            where: { is_active: true, is_restricted: false, is_default: true },
            order: { created_at: 'ASC' },
        }),

        // 获取默认提示词
        AIPromptRepository.findOne({
            where: { is_active: true, is_restricted: false, is_default: true },
            order: { created_at: 'ASC' },
        }),
    ]);

    // 兜底的模型和提示词
    const fallbackModel = 'gpt-4o-mini';
    const fallbackPrompt = '你是一个有用的AI助手，请回答用户的问题。';

    // 获取模型的默认参数
    const defaultParams =
        (modelMapping?.model.default_params as Partial<CompletionRequest>) ??
        (defaultModel?.default_params as Partial<CompletionRequest>) ??
        {};

    // 创建参数对象，包括extra_body
    const params: Partial<CompletionRequest> = {
        ...defaultParams,
        extra_body: {
            ...(defaultParams.extra_body || {}),
        },
    };

    let enableWebSearch = false;

    if (modelMapping) {
        if (modelMapping.enable_search) {
            enableWebSearch = true;
        }

        // 如果enable_multimodal为true，添加"ocr_model":"gpt-4o-mini"
        if (modelMapping.enable_multimodal) {
            params.extra_body = {
                ...(params.extra_body || {}),
                ocr_model: 'gpt-4o-mini',
            };
        }
    }

    // 构建配置
    return {
        model: modelMapping?.model.model_id ?? defaultModel?.model_id ?? fallbackModel,
        prompt: promptMapping?.prompt.content ?? defaultPrompt?.content ?? fallbackPrompt,
        params: params,
        prompt_id: promptMapping?.prompt.prompt_id ?? defaultPrompt?.prompt_id ?? '',
        model_id: modelMapping?.model.model_id ?? defaultModel?.model_id ?? '',
        enableWebSearch,
    };
}

/**
 * 设置特定聊天的模型
 * @param chatId 聊天ID
 * @param modelId 模型ID
 */
export async function setChatModel(chatId: string, modelId: string): Promise<boolean> {
    try {
        // 获取聊天信息
        const chatInfo = await BaseChatInfoRepository.findOne({ where: { chat_id: chatId } });
        if (!chatInfo) {
            return false;
        }

        // 获取模型信息
        const model = await AIModelRepository.findOne({
            where: { model_id: modelId, is_active: true },
        });
        if (!model) {
            return false;
        }

        // 检查权限
        if (model.is_restricted && chatInfo.can_access_restricted_models !== true) {
            return false;
        }

        // 查找现有映射
        let mapping = await ChatModelMappingRepository.findOne({
            where: { chat_id: chatId, is_active: true },
        });

        if (mapping) {
            // 更新现有映射
            mapping.model_id = modelId;
            mapping.updated_at = new Date();
            await ChatModelMappingRepository.save(mapping);
        } else {
            // 创建新映射
            mapping = ChatModelMappingRepository.create({
                chat_id: chatId,
                model_id: modelId,
            });
            await ChatModelMappingRepository.save(mapping);
        }

        return true;
    } catch (error) {
        console.error('设置聊天模型时出错:', error);
        return false;
    }
}

/**
 * 设置特定聊天的提示词
 * @param chatId 聊天ID
 * @param promptId 提示词ID
 */
export async function setChatPrompt(chatId: string, promptId: string): Promise<boolean> {
    try {
        // 获取聊天信息
        const chatInfo = await BaseChatInfoRepository.findOne({ where: { chat_id: chatId } });
        if (!chatInfo) {
            return false;
        }

        // 获取提示词信息
        const prompt = await AIPromptRepository.findOne({
            where: { prompt_id: promptId, is_active: true },
        });
        if (!prompt) {
            return false;
        }

        // 检查权限
        if (prompt.is_restricted && chatInfo.can_access_restricted_prompts !== true) {
            return false;
        }

        // 查找现有映射
        let mapping = await ChatPromptMappingRepository.findOne({
            where: { chat_id: chatId, is_active: true },
        });

        if (mapping) {
            // 更新现有映射
            mapping.prompt_id = promptId;
            mapping.updated_at = new Date();
            await ChatPromptMappingRepository.save(mapping);
        } else {
            // 创建新映射
            mapping = ChatPromptMappingRepository.create({
                chat_id: chatId,
                prompt_id: promptId,
            });
            await ChatPromptMappingRepository.save(mapping);
        }

        return true;
    } catch (error) {
        console.error('设置聊天提示词时出错:', error);
        return false;
    }
}
