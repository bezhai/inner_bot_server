/**
 * @file tool-manager.ts
 * @description 工具管理器，简化版本用于工具系统集成
 */

import logger from '../logger';

/**
 * 工具函数类型
 */
type ToolFunction = (...args: any[]) => any;

/**
 * 工具Schema类型
 */
interface ToolSchema {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

/**
 * 工具管理器类
 */
export class ToolManager {
    private tools: Map<string, ToolFunction> = new Map();
    private toolSchemas: ToolSchema[] = [];
    private toolMetadata: Map<string, Record<string, any>> = new Map();

    /**
     * 注册工具
     */
    registerTool(
        name: string,
        func: ToolFunction,
        schema: ToolSchema,
        metadata?: Record<string, any>
    ): void {
        this.tools.set(name, func);
        
        // 避免重复添加相同的schema
        if (!this.toolSchemas.some(s => s.function.name === name)) {
            this.toolSchemas.push(schema);
        }
        
        // 存储元数据
        this.toolMetadata.set(name, metadata || {});
        
        console.info(`已注册工具: ${name}`);
    }

    /**
     * 获取工具Schema列表
     */
    getToolsSchema(): ToolSchema[] {
        return [...this.toolSchemas];
    }

    /**
     * 检查工具是否存在
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * 执行工具调用
     */
    async executeTool(name: string, args: Record<string, any>): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`工具 ${name} 未找到`);
        }

        try {
            console.info(`执行工具: ${name}`, { args });
            const result = await tool(args);
            console.info(`工具 ${name} 执行完成`);
            return result;
        } catch (error) {
            console.error(`工具 ${name} 执行失败`, { error });
            throw error;
        }
    }

    /**
     * 获取已注册的工具列表
     */
    getRegisteredTools(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * 清空所有工具
     */
    clearTools(): void {
        this.tools.clear();
        this.toolSchemas.length = 0;
        this.toolMetadata.clear();
        console.info('已清空所有工具');
    }
}

// 全局工具管理器实例
let toolManagerInstance: ToolManager | null = null;

/**
 * 初始化工具管理器
 */
export function initToolManager(): ToolManager {
    if (!toolManagerInstance) {
        toolManagerInstance = new ToolManager();
        console.info('工具管理器已初始化');
    }
    return toolManagerInstance;
}

/**
 * 获取工具管理器实例
 */
export function getToolManager(): ToolManager {
    if (!toolManagerInstance) {
        throw new Error('工具管理器未初始化，请先调用 initToolManager()');
    }
    return toolManagerInstance;
}
