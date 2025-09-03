/**
 * LangGraph基础Agent系统使用示例
 * 
 * 这个文件展示了如何使用基础agent系统的各种功能
 */

import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
    AgentFactory,
    UnifiedAgent,
    OutputMode,
    AgentRunOptions,
    MultiAgentConfig,
    StreamEvent
} from './index';
import { availableTools, getAllTools } from './tools';

/**
 * 示例1：创建简单的单一Agent
 */
export async function exampleSingleAgent() {
    // 创建agent配置
    const config = AgentFactory.createSimpleConfig(
        'gpt-4',
        'your-api-key',
        'https://api.openai.com/v1',
        { temperature: 0.7 }
    );

    // 创建agent并添加工具
    const agent = AgentFactory.createReactAgent(config);
    agent.addTools([availableTools.calculator, availableTools.getCurrentTime]);

    // 创建统一接口
    const unifiedAgent = new UnifiedAgent(agent);

    // 运行agent（最终结果模式）
    const result = await unifiedAgent.run([
        new HumanMessage('请计算 15 * 23，然后告诉我现在的时间')
    ], {
        outputMode: OutputMode.FINAL_ONLY,
        maxIterations: 10
    });

    console.log('最终结果:', result);
    return result;
}

/**
 * 示例2：流式输出模式
 */
export async function exampleStreamingAgent() {
    const config = AgentFactory.createSimpleConfig(
        'gpt-4',
        'your-api-key',
        'https://api.openai.com/v1'
    );

    const agent = AgentFactory.createReactAgent(config, [availableTools.search]);
    const unifiedAgent = new UnifiedAgent(agent);

    // 设置流式监听器
    const listener = unifiedAgent.createStreamListener();
    
    listener.onStream((event: StreamEvent) => {
        switch (event.type) {
            case 'message_start':
                console.log('🔄 开始生成消息:', event.data.messageId);
                break;
            case 'message_chunk':
                console.log('📝 消息内容:', event.data.content);
                break;
            case 'tool_call_start':
                console.log('🔧 开始调用工具:', event.data.toolName, event.data.input);
                break;
            case 'tool_call_end':
                console.log('✅ 工具调用完成:', event.data.toolName, event.data.output);
                break;
            case 'message_end':
                console.log('✅ 消息生成完成:', event.data.messageId);
                break;
        }
    });

    listener.onComplete((result) => {
        console.log('🎉 Agent运行完成:', result);
    });

    listener.onError((event) => {
        console.error('❌ 发生错误:', event.data.error);
    });

    // 运行agent（流式模式）
    const result = await unifiedAgent.run([
        new HumanMessage('搜索关于人工智能的最新信息')
    ], {
        outputMode: OutputMode.STREAMING,
        maxIterations: 5
    });

    return result;
}

/**
 * 示例3：Multi-Agent系统
 */
export async function exampleMultiAgent() {
    // 创建自定义工具
    const weatherTool = tool(
        async (input: { city: string }) => {
            return `${input.city}的天气：晴朗，温度25°C`;
        },
        {
            name: 'get_weather',
            description: '获取指定城市的天气信息',
            schema: z.object({
                city: z.string().describe('城市名称')
            })
        }
    );

    const newsTool = tool(
        async (input: { topic: string }) => {
            return `关于${input.topic}的最新新闻：这是一条模拟新闻...`;
        },
        {
            name: 'get_news',
            description: '获取指定主题的最新新闻',
            schema: z.object({
                topic: z.string().describe('新闻主题')
            })
        }
    );

    // 配置multi-agent系统
    const multiAgentConfig: MultiAgentConfig = {
        agents: {
            weather_agent: {
                name: 'weather_agent',
                description: '天气信息专家，负责提供天气相关的信息',
                modelName: 'gpt-4',
                apiKey: 'your-api-key',
                baseUrl: 'https://api.openai.com/v1',
                tools: [weatherTool],
                prompt: '你是一个天气信息专家，专门提供准确的天气信息和相关建议。'
            },
            news_agent: {
                name: 'news_agent',
                description: '新闻信息专家，负责提供最新的新闻资讯',
                modelName: 'gpt-4',
                apiKey: 'your-api-key',
                baseUrl: 'https://api.openai.com/v1',
                tools: [newsTool],
                prompt: '你是一个新闻信息专家，专门提供最新、准确的新闻资讯。'
            }
        },
        defaultAgent: 'weather_agent',
        supervisorConfig: {
            modelName: 'gpt-4',
            apiKey: 'your-api-key',
            baseUrl: 'https://api.openai.com/v1',
            prompt: `你是一个智能任务分配监督者。根据用户的请求，选择最合适的专业代理：

- weather_agent: 处理天气相关的查询
- news_agent: 处理新闻资讯相关的查询

请分析用户的请求，然后将任务分配给最合适的代理。`
        }
    };

    // 创建multi-agent系统
    const multiAgent = AgentFactory.createMultiAgent(multiAgentConfig);
    const unifiedAgent = new UnifiedAgent(multiAgent);

    // 设置流式监听器
    const listener = unifiedAgent.createStreamListener();
    
    listener.onStream((event: StreamEvent) => {
        switch (event.type) {
            case 'agent_switch':
                console.log(`🔄 Agent切换: ${event.data.fromAgent} -> ${event.data.toAgent}`);
                break;
            case 'tool_call_start':
                console.log('🔧 工具调用:', event.data.toolName, event.data.input);
                break;
            case 'tool_call_end':
                console.log('✅ 工具完成:', event.data.toolName, event.data.output);
                break;
        }
    });

    // 运行multi-agent系统
    const result = await unifiedAgent.run([
        new HumanMessage('我想知道北京的天气情况，然后再看看最新的科技新闻')
    ], {
        outputMode: OutputMode.STREAMING,
        maxIterations: 15
    });

    console.log('Multi-Agent结果:', result);
    return result;
}

/**
 * 示例4：自定义工具的Agent
 */
export async function exampleCustomToolsAgent() {
    // 创建自定义工具
    const customTool = tool(
        async (input: { action: string; data: any }) => {
            return `执行自定义操作"${input.action}"，数据：${JSON.stringify(input.data)}`;
        },
        {
            name: 'custom_action',
            description: '执行自定义操作',
            schema: z.object({
                action: z.string().describe('要执行的操作'),
                data: z.any().describe('操作所需的数据')
            })
        }
    );

    const config = AgentFactory.createSimpleConfig(
        'gpt-4',
        'your-api-key',
        'https://api.openai.com/v1'
    );

    const agent = AgentFactory.createReactAgent(config, [customTool]);
    const unifiedAgent = new UnifiedAgent(agent);

    const result = await unifiedAgent.run([
        new HumanMessage('请使用自定义操作处理一些数据')
    ]);

    return result;
}

/**
 * 示例5：简化的消息格式
 */
export async function exampleSimpleMessageFormat() {
    const config = AgentFactory.createSimpleConfig(
        'gpt-4',
        'your-api-key'
    );

    const agent = AgentFactory.createReactAgent(config, getAllTools());
    const unifiedAgent = new UnifiedAgent(agent);

    // 使用简化的消息格式
    const result = await unifiedAgent.run([
        { role: 'user', content: '你好，请介绍一下你自己' },
        { role: 'assistant', content: '我是一个AI助手' },
        { role: 'user', content: '现在几点了？' }
    ]);

    return result;
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
    console.log('=== 运行所有Agent示例 ===\n');

    try {
        console.log('1. 单一Agent示例');
        await exampleSingleAgent();
        console.log('\n');

        console.log('2. 流式输出示例');
        await exampleStreamingAgent();
        console.log('\n');

        console.log('3. Multi-Agent示例');
        await exampleMultiAgent();
        console.log('\n');

        console.log('4. 自定义工具示例');
        await exampleCustomToolsAgent();
        console.log('\n');

        console.log('5. 简化消息格式示例');
        await exampleSimpleMessageFormat();
        console.log('\n');

        console.log('✅ 所有示例运行完成');
    } catch (error) {
        console.error('❌ 示例运行出错:', error);
    }
}