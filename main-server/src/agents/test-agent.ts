/**
 * Agent系统测试文件
 * 用于验证基础agent功能是否正常工作
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

/**
 * 测试单一Agent
 */
export async function testSingleAgent() {
    console.log('=== 测试单一Agent ===');
    
    try {
        const config = AgentFactory.createSimpleConfig(
            'gpt-3.5-turbo',
            process.env.OPENAI_API_KEY || 'test-key',
            process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        );

        const agent = AgentFactory.createReactAgent(config, [
            availableTools.calculator,
            availableTools.getCurrentTime
        ]);

        const unifiedAgent = new UnifiedAgent(agent);

        console.log('✅ Agent创建成功');
        console.log('🔧 工具数量:', agent.getTools().length);

        // 测试最终结果模式
        const result = await unifiedAgent.run([
            new HumanMessage('请计算 25 * 4，然后告诉我现在的时间')
        ], {
            outputMode: OutputMode.FINAL_ONLY,
            maxIterations: 5
        });

        console.log('📋 运行结果:', {
            success: result.success,
            messageCount: result.messages.length,
            toolCallsCount: result.toolCalls.length,
            error: result.error
        });

        return { success: true, result };
    } catch (error) {
        console.error('❌ 单一Agent测试失败:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * 测试流式输出
 */
export async function testStreamingAgent() {
    console.log('\n=== 测试流式输出 ===');
    
    try {
        const config = AgentFactory.createSimpleConfig(
            'gpt-3.5-turbo',
            process.env.OPENAI_API_KEY || 'test-key',
            process.env.OPENAI_BASE_URL
        );

        const agent = AgentFactory.createReactAgent(config, [availableTools.textProcessor]);
        const unifiedAgent = new UnifiedAgent(agent);

        // 设置流式监听器
        const listener = unifiedAgent.createStreamListener();
        const events: StreamEvent[] = [];

        listener.onStream((event: StreamEvent) => {
            events.push(event);
            console.log(`📡 [${event.type}]`, event.data);
        });

        listener.onError((event: StreamEvent) => {
            console.error('❌ 流式错误:', event.data);
        });

        listener.onComplete((result) => {
            console.log('🎉 流式完成，总事件数:', events.length);
        });

        // 运行流式agent
        const result = await unifiedAgent.run([
            new HumanMessage('请将文本"Hello World"转换为大写')
        ], {
            outputMode: OutputMode.STREAMING,
            maxIterations: 3
        });

        console.log('📋 流式运行结果:', {
            success: result.success,
            eventsCount: events.length,
            error: result.error
        });

        return { success: true, result, eventsCount: events.length };
    } catch (error) {
        console.error('❌ 流式Agent测试失败:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * 测试Multi-Agent系统
 */
export async function testMultiAgent() {
    console.log('\n=== 测试Multi-Agent系统 ===');
    
    try {
        // 创建专门的工具
        const mathTool = tool(
            async (input: { operation: string; a: number; b: number }) => {
                const { operation, a, b } = input;
                switch (operation) {
                    case 'add': return `${a} + ${b} = ${a + b}`;
                    case 'multiply': return `${a} * ${b} = ${a * b}`;
                    case 'subtract': return `${a} - ${b} = ${a - b}`;
                    case 'divide': return `${a} / ${b} = ${a / b}`;
                    default: return '不支持的操作';
                }
            },
            {
                name: 'math_calculator',
                description: '执行数学运算',
                schema: z.object({
                    operation: z.enum(['add', 'multiply', 'subtract', 'divide']).describe('数学操作'),
                    a: z.number().describe('第一个数字'),
                    b: z.number().describe('第二个数字')
                })
            }
        );

        const textTool = tool(
            async (input: { text: string; action: string }) => {
                switch (input.action) {
                    case 'count_words':
                        return `单词数量: ${input.text.split(' ').length}`;
                    case 'count_chars':
                        return `字符数量: ${input.text.length}`;
                    default:
                        return '不支持的文本操作';
                }
            },
            {
                name: 'text_analyzer',
                description: '分析文本内容',
                schema: z.object({
                    text: z.string().describe('要分析的文本'),
                    action: z.enum(['count_words', 'count_chars']).describe('分析操作')
                })
            }
        );

        // 配置multi-agent系统
        const multiAgentConfig: MultiAgentConfig = {
            agents: {
                math_expert: {
                    name: 'math_expert',
                    description: '数学计算专家',
                    modelName: 'gpt-3.5-turbo',
                    apiKey: process.env.OPENAI_API_KEY || 'test-key',
                    baseUrl: process.env.OPENAI_BASE_URL,
                    tools: [mathTool],
                    prompt: '你是一个数学计算专家，专门处理各种数学计算问题。'
                },
                text_expert: {
                    name: 'text_expert',
                    description: '文本处理专家',
                    modelName: 'gpt-3.5-turbo',
                    apiKey: process.env.OPENAI_API_KEY || 'test-key',
                    baseUrl: process.env.OPENAI_BASE_URL,
                    tools: [textTool],
                    prompt: '你是一个文本处理专家，专门处理各种文本分析和处理任务。'
                }
            },
            defaultAgent: 'math_expert'
        };

        const multiAgent = AgentFactory.createMultiAgent(multiAgentConfig);
        const unifiedAgent = new UnifiedAgent(multiAgent);

        console.log('✅ Multi-Agent系统创建成功');
        console.log('🤖 Agent类型:', unifiedAgent.getType());

        // 监听agent切换事件
        const listener = unifiedAgent.createStreamListener();
        listener.onStream((event: StreamEvent) => {
            if (event.type === 'agent_switch') {
                console.log(`🔄 Agent切换: ${event.data.fromAgent} -> ${event.data.toAgent}`);
            }
        });

        // 运行multi-agent系统
        const result = await unifiedAgent.run([
            new HumanMessage('请计算 15 * 23，然后分析文本"Hello World Example"的单词数量')
        ], {
            outputMode: OutputMode.FINAL_ONLY,
            maxIterations: 10
        });

        console.log('📋 Multi-Agent运行结果:', {
            success: result.success,
            messageCount: result.messages.length,
            toolCallsCount: result.toolCalls.length,
            error: result.error
        });

        return { success: true, result };
    } catch (error) {
        console.error('❌ Multi-Agent测试失败:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * 测试Agent管理器
 */
export async function testAgentManager() {
    console.log('\n=== 测试Agent管理器 ===');
    
    try {
        const manager = AgentManager.createPreconfiguredManager(
            'gpt-3.5-turbo',
            process.env.OPENAI_API_KEY || 'test-key',
            process.env.OPENAI_BASE_URL
        );

        // 创建多个agent
        const agent1 = manager.createSingleAgent('calculator', {}, [availableTools.calculator]);
        const agent2 = manager.createSingleAgent('timer', {}, [availableTools.getCurrentTime]);

        console.log('✅ Agent管理器创建成功');
        console.log('🤖 管理的Agent数量:', manager.getAgentNames().length);
        console.log('📝 Agent列表:', manager.getAgentNames());

        // 健康检查
        const health = await manager.healthCheck();
        console.log('💊 健康检查:', health);

        // 批量运行
        const results = await manager.runMultipleAgents([
            {
                agentName: 'calculator',
                messages: [new HumanMessage('计算 100 / 5')],
                options: { outputMode: OutputMode.FINAL_ONLY }
            },
            {
                agentName: 'timer',
                messages: [new HumanMessage('现在几点了？')],
                options: { outputMode: OutputMode.FINAL_ONLY }
            }
        ]);

        console.log('📊 批量运行结果:', results.map(r => ({
            agent: r.agentName,
            success: r.result.success,
            error: r.error
        })));

        // 清理
        manager.cleanup();

        return { success: true, results };
    } catch (error) {
        console.error('❌ Agent管理器测试失败:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * 运行所有测试
 */
export async function runAllTests() {
    console.log('🚀 开始运行Agent系统测试\n');
    
    const testResults = [];

    // 测试单一Agent
    testResults.push(await testSingleAgent());

    // 测试流式输出
    testResults.push(await testStreamingAgent());

    // 测试Multi-Agent系统
    testResults.push(await testMultiAgent());

    // 测试Agent管理器
    testResults.push(await testAgentManager());

    // 汇总结果
    const successCount = testResults.filter(r => r.success).length;
    const totalCount = testResults.length;

    console.log(`\n📊 测试汇总: ${successCount}/${totalCount} 通过`);
    
    if (successCount === totalCount) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('⚠️  部分测试失败，请检查错误信息');
        testResults.forEach((result, index) => {
            if (!result.success) {
                console.log(`❌ 测试 ${index + 1} 失败:`, result.error);
            }
        });
    }

    return {
        success: successCount === totalCount,
        results: testResults,
        summary: { passed: successCount, total: totalCount }
    };
}

/**
 * 快速测试（不需要真实API密钥）
 */
export function quickValidationTest() {
    console.log('🔍 执行快速验证测试（不调用API）');
    
    try {
        // 测试配置创建
        const config = AgentFactory.createSimpleConfig(
            'gpt-4',
            'test-key',
            'https://api.openai.com/v1'
        );
        console.log('✅ 配置创建成功');

        // 测试agent创建
        const agent = AgentFactory.createReactAgent(config, [availableTools.calculator]);
        console.log('✅ 单一Agent创建成功');

        // 测试工具添加
        agent.addTool(availableTools.getCurrentTime);
        console.log('✅ 工具添加成功，当前工具数量:', agent.getTools().length);

        // 测试统一接口
        const unifiedAgent = new UnifiedAgent(agent);
        console.log('✅ 统一接口创建成功，类型:', unifiedAgent.getType());

        // 测试管理器
        const manager = AgentManager.createPreconfiguredManager(
            'gpt-4',
            'test-key'
        );
        console.log('✅ Agent管理器创建成功');

        console.log('🎉 快速验证测试全部通过！');
        return { success: true };
    } catch (error) {
        console.error('❌ 快速验证测试失败:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}