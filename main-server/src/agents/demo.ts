#!/usr/bin/env npx ts-node

/**
 * LangGraph基础Agent系统演示
 * 
 * 运行方式：
 * cd main-server && npx ts-node src/agents/demo.ts
 * 
 * 或者设置环境变量后运行：
 * OPENAI_API_KEY=your_key npx ts-node src/agents/demo.ts
 */

import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
    AgentFactory,
    UnifiedAgent,
    AgentManager,
    OutputMode,
    MultiAgentConfig,
    StreamEvent
} from './index';
import { availableTools } from './tools';

async function demoBasicAgent() {
    console.log('\n🤖 === 基础Agent演示 ===');
    
    const config = AgentFactory.createSimpleConfig(
        'gpt-3.5-turbo',
        process.env.OPENAI_API_KEY || 'demo-key',
        process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    );

    const agent = AgentFactory.createReactAgent(config, [
        availableTools.calculator,
        availableTools.getCurrentTime
    ]);

    const unifiedAgent = new UnifiedAgent(agent);

    console.log('✅ 基础Agent创建成功');
    console.log('🔧 可用工具:', agent.getTools().map(t => t.name));
    console.log('⚙️  配置:', agent.getConfig());
    
    if (process.env.OPENAI_API_KEY) {
        try {
            const result = await unifiedAgent.run([
                new HumanMessage('请计算 12 * 8，然后告诉我现在的时间')
            ], {
                outputMode: OutputMode.FINAL_ONLY,
                maxIterations: 5
            });

            console.log('📋 运行结果:', {
                success: result.success,
                messageCount: result.messages.length,
                toolCallsCount: result.toolCalls.length,
                finalContent: result.finalMessage?.content?.slice(0, 100) + '...'
            });
        } catch (error) {
            console.log('⚠️  需要有效的API密钥才能运行实际测试');
        }
    } else {
        console.log('⚠️  设置OPENAI_API_KEY环境变量以运行实际测试');
    }
}

async function demoStreamingAgent() {
    console.log('\n📡 === 流式输出演示 ===');
    
    const config = AgentFactory.createSimpleConfig(
        'gpt-3.5-turbo',
        process.env.OPENAI_API_KEY || 'demo-key'
    );

    const agent = AgentFactory.createReactAgent(config, [availableTools.textProcessor]);
    const unifiedAgent = new UnifiedAgent(agent);

    // 设置流式监听器
    const listener = unifiedAgent.createStreamListener();
    const events: StreamEvent[] = [];

    listener.onStream((event: StreamEvent) => {
        events.push(event);
        console.log(`📡 [${event.type}]`, JSON.stringify(event.data).slice(0, 100));
    });

    console.log('✅ 流式监听器设置成功');
    
    if (process.env.OPENAI_API_KEY) {
        try {
            const result = await unifiedAgent.run([
                new HumanMessage('请将"Hello LangGraph"转换为大写')
            ], {
                outputMode: OutputMode.STREAMING
            });

            console.log('📊 流式结果统计:', {
                success: result.success,
                eventsCount: events.length,
                eventTypes: [...new Set(events.map(e => e.type))]
            });
        } catch (error) {
            console.log('⚠️  需要有效的API密钥才能运行实际测试');
        }
    } else {
        console.log('⚠️  设置OPENAI_API_KEY环境变量以运行实际测试');
    }
}

async function demoMultiAgent() {
    console.log('\n🔄 === Multi-Agent演示 ===');
    
    // 创建专门的工具
    const mathTool = tool(
        async (input: { operation: string; a: number; b: number }) => {
            const { operation, a, b } = input;
            switch (operation) {
                case 'add': return `${a} + ${b} = ${a + b}`;
                case 'multiply': return `${a} * ${b} = ${a * b}`;
                default: return '不支持的操作';
            }
        },
        {
            name: 'math_operation',
            description: '执行数学运算',
            schema: z.object({
                operation: z.enum(['add', 'multiply']).describe('数学操作'),
                a: z.number().describe('第一个数字'),
                b: z.number().describe('第二个数字')
            })
        }
    );

    const textTool = tool(
        async (input: { text: string }) => {
            return `文本"${input.text}"的长度是${input.text.length}个字符`;
        },
        {
            name: 'text_length',
            description: '计算文本长度',
            schema: z.object({
                text: z.string().describe('要分析的文本')
            })
        }
    );

    const multiAgentConfig: MultiAgentConfig = {
        agents: {
            math_expert: {
                name: 'math_expert',
                description: '数学计算专家',
                modelName: 'gpt-3.5-turbo',
                apiKey: process.env.OPENAI_API_KEY || 'demo-key',
                baseUrl: process.env.OPENAI_BASE_URL,
                tools: [mathTool]
            },
            text_expert: {
                name: 'text_expert',
                description: '文本处理专家',
                modelName: 'gpt-3.5-turbo',
                apiKey: process.env.OPENAI_API_KEY || 'demo-key',
                baseUrl: process.env.OPENAI_BASE_URL,
                tools: [textTool]
            }
        },
        defaultAgent: 'math_expert'
    };

    const multiAgent = AgentFactory.createMultiAgent(multiAgentConfig);
    const unifiedAgent = new UnifiedAgent(multiAgent);

    console.log('✅ Multi-Agent系统创建成功');
    console.log('🤖 Agent类型:', unifiedAgent.getType());
    console.log('👥 可用Agent:', Object.keys(multiAgentConfig.agents));
    
    if (process.env.OPENAI_API_KEY) {
        try {
            const result = await unifiedAgent.run([
                new HumanMessage('请计算 15 * 4，然后分析文本"LangGraph Demo"的长度')
            ], {
                outputMode: OutputMode.FINAL_ONLY,
                maxIterations: 10
            });

            console.log('📋 Multi-Agent运行结果:', {
                success: result.success,
                messageCount: result.messages.length,
                toolCallsCount: result.toolCalls.length
            });
        } catch (error) {
            console.log('⚠️  需要有效的API密钥才能运行实际测试');
        }
    } else {
        console.log('⚠️  设置OPENAI_API_KEY环境变量以运行实际测试');
    }
}

async function demoAgentManager() {
    console.log('\n📋 === Agent管理器演示 ===');
    
    const manager = AgentManager.createPreconfiguredManager(
        'gpt-3.5-turbo',
        process.env.OPENAI_API_KEY || 'demo-key',
        process.env.OPENAI_BASE_URL
    );

    // 创建不同的专业agent
    const calcAgent = manager.createSingleAgent('calculator', {}, [availableTools.calculator]);
    const timeAgent = manager.createSingleAgent('timer', {}, [availableTools.getCurrentTime]);

    console.log('✅ Agent管理器创建成功');
    console.log('🤖 管理的Agent数量:', manager.getAgentNames().length);
    console.log('📝 Agent列表:', manager.getAgentNames());

    // 健康检查
    const health = await manager.healthCheck();
    console.log('💊 健康检查结果:', health);

    // 清理资源
    manager.cleanup();
    console.log('🧹 资源清理完成');
}

async function main() {
    console.log('🚀 LangGraph基础Agent系统演示开始\n');
    
    try {
        await demoBasicAgent();
        await demoStreamingAgent();
        await demoMultiAgent();
        await demoAgentManager();
        
        console.log('\n🎉 演示完成！');
        console.log('\n📖 使用说明:');
        console.log('1. 设置环境变量 OPENAI_API_KEY 以运行实际的AI测试');
        console.log('2. 可选设置 OPENAI_BASE_URL 使用自定义API端点');
        console.log('3. 查看 README.md 了解详细的API文档');
        console.log('4. 查看 examples.ts 了解更多使用示例');
        
    } catch (error) {
        console.error('❌ 演示过程中发生错误:', error);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}