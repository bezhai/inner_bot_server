/**
 * @file model-config-service.ts
 * @description 模型配置服务，完整迁移自ai-service
 */

import { DataSource } from 'typeorm';
import { ModelProvider } from '../../dal/entities';
import logger from '../logger';

/**
 * 模型配置信息接口
 */
export interface ModelConfigInfo {
    model_id: string;
    provider_name: string;
    api_key: string;
    base_url: string;
    model_name: string;
}

/**
 * 模型配置服务类
 */
export class ModelConfigService {
    /**
     * 解析model_id格式："{供应商名称}/模型原名"
     */
    static parseModelId(modelId: string): [string, string] {
        if (modelId.includes('/')) {
            const [providerName, modelName] = modelId.split('/', 2);
            return [providerName.trim(), modelName.trim()];
        } else {
            // 如果没有/，使用默认供应商302.ai
            return ['302.ai', modelId.trim()];
        }
    }

    /**
     * 根据model_id获取供应商配置和模型名称
     */
    static async getModelAndProviderInfo(modelId: string): Promise<ModelConfigInfo | null> {
        try {
            const [providerName, actualModelName] = this.parseModelId(modelId);

            // 获取数据库连接
            const AppDataSource = (global as any).AppDataSource as DataSource;
            if (!AppDataSource) {
                throw new Error('数据库连接未初始化');
            }

            const modelProviderRepo = AppDataSource.getRepository(ModelProvider);

            // 直接查询供应商信息
            let provider = await modelProviderRepo.findOne({
                where: { name: providerName }
            });

            // 如果找不到指定供应商，尝试使用默认的302.ai
            if (!provider) {
                provider = await modelProviderRepo.findOne({
                    where: { name: '302.ai' }
                });
            }

            if (!provider) {
                logger.error(`未找到供应商配置: ${providerName}`);
                return null;
            }

            const result: ModelConfigInfo = {
                model_id: modelId,
                provider_name: provider.name,
                api_key: provider.apiKey,
                base_url: provider.baseUrl,
                model_name: actualModelName,
            };

            logger.info(`获取模型配置成功: ${modelId}`, { providerName: provider.name });
            return result;

        } catch (error) {
            logger.error(`获取模型配置失败: ${modelId}`, { error });
            return null;
        }
    }


}