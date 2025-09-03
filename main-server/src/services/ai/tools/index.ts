/**
 * @file tools/index.ts
 * @description AI工具集合，基于ai-service中的Python工具实现TypeScript版本
 */

import { getToolManager } from '../tool-manager';
import { searchDoujinEvent } from './doujin-tool';
import { searchWeb } from './web-search-tool';
import { bangumiSearch } from './bangumi-tool';

/**
 * 注册所有AI工具
 */
export function registerAllTools(): void {
    const toolManager = getToolManager();
    
    // 1. 同人展搜索工具
    toolManager.registerTool(
        'search_doujin_event',
        searchDoujinEvent,
        {
            type: 'function',
            function: {
                name: 'search_doujin_event',
                description: '搜索同人展活动，返回结构化的活动列表',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '搜索关键词，默认为空'
                        },
                        is_online: {
                            type: 'boolean',
                            description: '是否为线上活动，默认不限制'
                        },
                        recent_days: {
                            type: 'integer',
                            description: '最近几天内的活动，默认为全部'
                        },
                        activity_status: {
                            type: 'string',
                            enum: ['ongoing', 'ended'],
                            description: '活动状态：ongoing(未结束)、ended(已结束)，优先级比recent_days高'
                        },
                        activity_type: {
                            type: 'string',
                            enum: ['茶会', '综合同人展', 'ONLY', '线上活动', '官方活动', '综合展', '同好包场'],
                            description: '活动类型'
                        }
                    },
                    required: []
                }
            }
        },
        { category: 'search', description: '搜索同人展活动' }
    );

    // 2. 网页搜索工具
    toolManager.registerTool(
        'search_web',
        searchWeb,
        {
            type: 'function',
            function: {
                name: 'search_web',
                description: '搜索网络上的信息，并返回结构化的搜索结果',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '搜索关键词'
                        },
                        gl: {
                            type: 'string',
                            description: '国家代码，默认中国(cn)',
                            default: 'cn'
                        }
                    },
                    required: ['query']
                }
            }
        },
        { category: 'search', description: '网页搜索' }
    );

    // 3. Bangumi统一搜索工具
    toolManager.registerTool(
        'bangumi_search',
        bangumiSearch,
        {
            type: 'function',
            function: {
                name: 'bangumi_search',
                description: '通过Bangumi获取ACG相关信息，包括搜索条目、角色、人物以及获取关联信息',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '一个明确的查询请求，例如 "帮我查询进击的巨人里面有哪些角色" 或 "搜索鬼灭之刃"'
                        }
                    },
                    required: ['query']
                }
            }
        },
        { category: 'search', description: 'Bangumi ACG信息搜索' }
    );

    console.info(`已注册 ${toolManager.getRegisteredTools().length} 个工具:`, toolManager.getRegisteredTools());
}