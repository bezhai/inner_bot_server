/**
 * @file prompt-service.ts
 * @description 提示词服务，完整迁移自ai-service，集成数据库和模板引擎
 */

import nunjucks from 'nunjucks';
import { getPromptById } from '../prompts/prompt';
import { PromptGeneratorParam } from '../../types/ai-chat';
import logger from '../logger';

/**
 * 聊天提示词服务类
 */
export class ChatPromptService {
    /**
     * 从数据库获取主提示词
     */
    static async getPrompt(param: PromptGeneratorParam): Promise<string> {
        try {
            const prompt = await getPromptById('main');
            
            if (!prompt || !prompt.content) {
                throw new Error("未找到主提示词(id='main')");
            }

            // 使用nunjucks模板引擎渲染提示词
            const template = nunjucks.compile(prompt.content);
            const renderedPrompt = template.render({
                currDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                currTime: new Date().toTimeString().split(' ')[0], // HH:MM:SS
                ...param,
            });

            logger.info('主提示词获取成功', { promptId: 'main' });
            return renderedPrompt;

        } catch (error) {
            logger.error('获取主提示词失败', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    /**
     * 从数据库获取番剧提示词
     */
    static async getBangumiPrompt(): Promise<string> {
        try {
            const prompt = await getPromptById('bangumi');
            
            if (!prompt || !prompt.content) {
                throw new Error("未找到番剧提示词(id='bangumi')");
            }

            // 使用nunjucks模板引擎渲染提示词
            const template = nunjucks.compile(prompt.content);
            const renderedPrompt = template.render({
                currDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                currTime: new Date().toTimeString().split(' ')[0], // HH:MM:SS
            });

            logger.info('番剧提示词获取成功', { promptId: 'bangumi' });
            return renderedPrompt;

        } catch (error) {
            logger.error('获取番剧提示词失败', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
}