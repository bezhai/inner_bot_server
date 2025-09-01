/**
 * @file memory-client.ts
 * @description Memory服务客户端，完整迁移自ai-service
 */

import axios, { AxiosError } from 'axios';
import logger from '../logger';

/**
 * Memory服务配置
 */
interface MemoryServiceConfig {
    memoryBaseUrl?: string;
    memoryTimeoutSeconds: number;
    memoryMaxResults: number;
}

/**
 * 快速搜索结果接口
 */
interface QuickSearchResult {
    message_id: string;
    user_name: string;
    role: string;
    content: string;
    [key: string]: any;
}

/**
 * 历史消息响应接口
 */
interface HistoryMessagesResponse {
    total_count: number;
    messages: QuickSearchResult[];
}

/**
 * Memory服务客户端类
 */
export class MemoryClient {
    private baseUrl: string;
    private timeout: number;

    constructor(config: MemoryServiceConfig) {
        this.baseUrl = config.memoryBaseUrl || process.env.MEMORY_BASE_URL || '';
        this.timeout = config.memoryTimeoutSeconds * 1000; // 转换为毫秒
    }

    /**
     * 快速检索记忆内容
     */
    async quickSearch(
        contextMessageId: string,
        query?: string,
        maxResults: number = 20
    ): Promise<QuickSearchResult[]> {
        try {
            const requestData: any = {
                context_message_id: contextMessageId,
                max_results: maxResults,
            };

            if (query) {
                requestData.query = query;
            }

            const response = await axios.post(
                `${this.baseUrl}/api/v1/memory/quick_search`,
                requestData,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            const results = response.data?.results || [];
            logger.info(`Memory quick_search成功: ${results.length} 条结果`);
            return results;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.code === 'ECONNABORTED') {
                    logger.warn(`Memory服务超时: ${this.timeout / 1000}秒`);
                } else if (axiosError.response) {
                    logger.error(`Memory服务HTTP错误: ${axiosError.response.status} - ${axiosError.response.data}`);
                } else {
                    logger.error(`Memory服务网络错误: ${axiosError.message}`);
                }
            } else {
                logger.error(`Memory服务调用失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            return [];
        }
    }

    /**
     * 获取历史消息列表
     */
    async historyMessages(
        messageId: string,
        startTime: number,
        endTime: number
    ): Promise<HistoryMessagesResponse | null> {
        try {
            const requestData = {
                message_id: messageId,
                start_time: startTime,
                end_time: endTime,
            };

            const response = await axios.post(
                `${this.baseUrl}/api/v1/memory/history_messages`,
                requestData,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            const data = response.data;
            logger.info(`Memory history_messages成功，获取到 ${data.total_count || 0} 条消息`);
            return data;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.code === 'ECONNABORTED') {
                    logger.warn(`Memory服务超时: ${this.timeout / 1000}秒`);
                } else if (axiosError.response) {
                    logger.error(`Memory服务HTTP错误: ${axiosError.response.status} - ${axiosError.response.data}`);
                } else {
                    logger.error(`Memory服务网络错误: ${axiosError.message}`);
                }
            } else {
                logger.error(`Memory服务调用失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            return null;
        }
    }
}

/**
 * 创建Memory客户端单例
 */
const memoryConfig: MemoryServiceConfig = {
    memoryBaseUrl: process.env.MEMORY_BASE_URL,
    memoryTimeoutSeconds: parseInt(process.env.MEMORY_TIMEOUT_SECONDS || '3'),
    memoryMaxResults: parseInt(process.env.MEMORY_MAX_RESULTS || '20'),
};

export const memoryClient = new MemoryClient(memoryConfig);