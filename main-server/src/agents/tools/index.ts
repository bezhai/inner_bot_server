import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 示例工具：获取当前时间
 */
export const getCurrentTimeTool = tool(
    async () => {
        return new Date().toISOString();
    },
    {
        name: 'get_current_time',
        description: '获取当前的时间戳',
        schema: z.object({})
    }
);

/**
 * 示例工具：计算器
 */
export const calculatorTool = tool(
    async (input: { expression: string }) => {
        try {
            // 简单的数学表达式计算（生产环境中应使用更安全的方法）
            const result = Function(`"use strict"; return (${input.expression})`)();
            return `计算结果: ${result}`;
        } catch (error) {
            return `计算错误: ${error instanceof Error ? error.message : '未知错误'}`;
        }
    },
    {
        name: 'calculator',
        description: '执行数学计算，支持基本的数学表达式',
        schema: z.object({
            expression: z.string().describe('要计算的数学表达式，如 "2 + 3 * 4"')
        })
    }
);

/**
 * 示例工具：文本处理
 */
export const textProcessorTool = tool(
    async (input: { text: string; operation: 'uppercase' | 'lowercase' | 'reverse' | 'length' }) => {
        const { text, operation } = input;
        
        switch (operation) {
            case 'uppercase':
                return text.toUpperCase();
            case 'lowercase':
                return text.toLowerCase();
            case 'reverse':
                return text.split('').reverse().join('');
            case 'length':
                return `文本长度: ${text.length}`;
            default:
                return '不支持的操作';
        }
    },
    {
        name: 'text_processor',
        description: '处理文本，支持大小写转换、反转、计算长度等操作',
        schema: z.object({
            text: z.string().describe('要处理的文本'),
            operation: z.enum(['uppercase', 'lowercase', 'reverse', 'length']).describe('要执行的操作')
        })
    }
);

/**
 * 示例工具：搜索模拟
 */
export const searchTool = tool(
    async (input: { query: string; limit?: number }) => {
        const { query, limit = 5 } = input;
        
        // 模拟搜索结果
        const mockResults = [
            `关于"${query}"的搜索结果1`,
            `关于"${query}"的搜索结果2`,
            `关于"${query}"的搜索结果3`,
            `关于"${query}"的搜索结果4`,
            `关于"${query}"的搜索结果5`,
        ].slice(0, limit);
        
        return `搜索"${query}"找到${mockResults.length}个结果:\n${mockResults.join('\n')}`;
    },
    {
        name: 'search',
        description: '搜索信息并返回相关结果',
        schema: z.object({
            query: z.string().describe('搜索查询'),
            limit: z.number().optional().describe('返回结果的最大数量，默认为5')
        })
    }
);

/**
 * 所有可用的示例工具
 */
export const availableTools = {
    getCurrentTime: getCurrentTimeTool,
    calculator: calculatorTool,
    textProcessor: textProcessorTool,
    search: searchTool,
};

/**
 * 获取所有工具的数组
 */
export function getAllTools(): any[] {
    return Object.values(availableTools);
}

/**
 * 根据名称获取特定工具
 */
export function getToolsByNames(names: string[]): any[] {
    return names
        .map(name => availableTools[name as keyof typeof availableTools])
        .filter(Boolean);
}