/**
 * Agent系统集成示例
 * 展示如何在实际应用中集成LangGraph基础Agent系统
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
    AgentFactory,
    UnifiedAgent,
    AgentManager,
    OutputMode,
    MultiAgentConfig,
    StreamEvent,
    AgentRunResult
} from './index';

/**
 * 智能客服系统示例
 * 展示如何构建一个多专业领域的智能客服
 */
export class IntelligentCustomerService {
    private manager: AgentManager;
    private unifiedAgent: UnifiedAgent;

    constructor(apiKey: string, baseUrl?: string) {
        // 创建自定义工具
        const orderQueryTool = tool(
            async (input: { orderId: string }) => {
                // 模拟订单查询
                return `订单${input.orderId}状态：已发货，预计3天内到达`;
            },
            {
                name: 'query_order',
                description: '查询订单状态',
                schema: z.object({
                    orderId: z.string().describe('订单ID')
                })
            }
        );

        const productInfoTool = tool(
            async (input: { productName: string }) => {
                // 模拟产品信息查询
                return `产品${input.productName}：价格299元，库存充足，支持7天无理由退换货`;
            },
            {
                name: 'get_product_info',
                description: '获取产品信息',
                schema: z.object({
                    productName: z.string().describe('产品名称')
                })
            }
        );

        const refundTool = tool(
            async (input: { orderId: string; reason: string }) => {
                // 模拟退款处理
                return `订单${input.orderId}退款申请已提交，原因：${input.reason}，预计3-5个工作日处理完成`;
            },
            {
                name: 'process_refund',
                description: '处理退款申请',
                schema: z.object({
                    orderId: z.string().describe('订单ID'),
                    reason: z.string().describe('退款原因')
                })
            }
        );

        // 配置多专业领域的agent
        const multiAgentConfig: MultiAgentConfig = {
            agents: {
                order_specialist: {
                    name: 'order_specialist',
                    description: '订单专家，处理订单查询、物流跟踪等问题',
                    modelName: 'gpt-3.5-turbo',
                    apiKey,
                    baseUrl,
                    tools: [orderQueryTool],
                    prompt: '你是订单处理专家，专门处理订单查询、物流跟踪、发货状态等相关问题。请提供准确、友善的客户服务。'
                },
                product_specialist: {
                    name: 'product_specialist',
                    description: '产品专家，处理产品咨询、规格查询等问题',
                    modelName: 'gpt-3.5-turbo',
                    apiKey,
                    baseUrl,
                    tools: [productInfoTool],
                    prompt: '你是产品咨询专家，专门处理产品信息查询、规格说明、使用指导等问题。请提供详细、专业的产品信息。'
                },
                service_specialist: {
                    name: 'service_specialist',
                    description: '售后服务专家，处理退换货、投诉等问题',
                    modelName: 'gpt-3.5-turbo',
                    apiKey,
                    baseUrl,
                    tools: [refundTool],
                    prompt: '你是售后服务专家，专门处理退换货、投诉处理、服务咨询等问题。请以客户为中心，提供贴心的售后服务。'
                }
            },
            defaultAgent: 'order_specialist',
            supervisorConfig: {
                modelName: 'gpt-4',
                apiKey,
                baseUrl,
                prompt: `你是智能客服系统的任务分配器。根据客户问题的类型，将其分配给最合适的专业客服：

- order_specialist: 处理订单查询、物流跟踪、发货状态等订单相关问题
- product_specialist: 处理产品咨询、规格查询、使用指导等产品相关问题  
- service_specialist: 处理退换货、投诉、售后服务等服务相关问题

请分析客户的问题，然后选择最合适的专业客服来处理。`
            }
        };

        this.manager = new AgentManager(AgentFactory.createSimpleConfig('gpt-3.5-turbo', apiKey, baseUrl));
        
        // 创建multi-agent系统
        const multiAgent = AgentFactory.createMultiAgent(multiAgentConfig);
        this.unifiedAgent = new UnifiedAgent(multiAgent);

        // 设置事件监听
        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        this.unifiedAgent.on('stream', (event: StreamEvent) => {
            switch (event.type) {
                case 'agent_switch':
                    console.log(`🔄 客服切换: ${event.data.fromAgent} -> ${event.data.toAgent}`);
                    break;
                case 'tool_call_start':
                    console.log(`🔧 正在${event.data.toolName}...`);
                    break;
                case 'tool_call_end':
                    console.log(`✅ ${event.data.toolName}完成`);
                    break;
            }
        });
    }

    /**
     * 处理客户咨询
     */
    public async handleCustomerInquiry(
        inquiry: string,
        customerContext?: { customerId?: string; orderHistory?: string[] }
    ): Promise<AgentRunResult> {
        let contextMessage = inquiry;
        
        if (customerContext) {
            contextMessage = `客户咨询：${inquiry}`;
            if (customerContext.customerId) {
                contextMessage += `\n客户ID：${customerContext.customerId}`;
            }
            if (customerContext.orderHistory) {
                contextMessage += `\n历史订单：${customerContext.orderHistory.join(', ')}`;
            }
        }

        return await this.unifiedAgent.run([
            new HumanMessage(contextMessage)
        ], {
            outputMode: OutputMode.STREAMING,
            maxIterations: 15
        });
    }

    /**
     * 批量处理客户问题
     */
    public async handleBatchInquiries(
        inquiries: Array<{ id: string; question: string; context?: any }>
    ): Promise<Array<{ id: string; result: AgentRunResult; error?: string }>> {
        const results = [];

        for (const inquiry of inquiries) {
            try {
                const result = await this.handleCustomerInquiry(inquiry.question, inquiry.context);
                results.push({ id: inquiry.id, result });
            } catch (error) {
                results.push({
                    id: inquiry.id,
                    result: {
                        messages: [],
                        toolCalls: [],
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    },
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        return results;
    }

    /**
     * 获取系统状态
     */
    public getSystemStatus() {
        return {
            agentType: this.unifiedAgent.getType(),
            availableSpecialists: ['order_specialist', 'product_specialist', 'service_specialist'],
            isHealthy: true,
            version: '1.0.0'
        };
    }
}

/**
 * 代码助手Agent示例
 * 展示如何创建一个专门的编程助手
 */
export class CodeAssistantAgent {
    private unifiedAgent: UnifiedAgent;

    constructor(apiKey: string, baseUrl?: string) {
        // 创建代码相关的工具
        const codeAnalyzerTool = tool(
            async (input: { code: string; language: string }) => {
                const { code, language } = input;
                const lines = code.split('\n').length;
                const chars = code.length;
                return `代码分析结果：\n语言：${language}\n行数：${lines}\n字符数：${chars}`;
            },
            {
                name: 'analyze_code',
                description: '分析代码的基本信息',
                schema: z.object({
                    code: z.string().describe('要分析的代码'),
                    language: z.string().describe('编程语言')
                })
            }
        );

        const codeFormatterTool = tool(
            async (input: { code: string; style: string }) => {
                // 简单的格式化模拟
                return `已按照${input.style}风格格式化代码:\n${input.code}`;
            },
            {
                name: 'format_code',
                description: '格式化代码',
                schema: z.object({
                    code: z.string().describe('要格式化的代码'),
                    style: z.string().describe('格式化风格，如prettier、eslint等')
                })
            }
        );

        const config = AgentFactory.createSimpleConfig(
            'gpt-4',
            apiKey,
            baseUrl,
            { temperature: 0.3 } // 代码助手使用较低的温度
        );

        const agent = AgentFactory.createReactAgent(config, [
            codeAnalyzerTool,
            codeFormatterTool
        ]);

        this.unifiedAgent = new UnifiedAgent(agent);
    }

    /**
     * 代码审查
     */
    public async reviewCode(
        code: string,
        language: string,
        reviewType: 'security' | 'performance' | 'style' | 'general' = 'general'
    ): Promise<AgentRunResult> {
        const prompt = `请对以下${language}代码进行${reviewType}审查：\n\`\`\`${language}\n${code}\n\`\`\``;
        
        return await this.unifiedAgent.run([
            new HumanMessage(prompt)
        ], {
            outputMode: OutputMode.FINAL_ONLY
        });
    }

    /**
     * 代码生成
     */
    public async generateCode(
        requirement: string,
        language: string,
        framework?: string
    ): Promise<AgentRunResult> {
        let prompt = `请用${language}生成代码来实现以下需求：${requirement}`;
        if (framework) {
            prompt += `\n使用${framework}框架。`;
        }
        
        return await this.unifiedAgent.run([
            new HumanMessage(prompt)
        ], {
            outputMode: OutputMode.STREAMING
        });
    }
}

/**
 * 使用示例
 */
export async function demonstrateIntegration() {
    console.log('\n🔧 === 集成示例演示 ===');
    
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  需要设置OPENAI_API_KEY环境变量以运行集成示例');
        return;
    }

    try {
        // 1. 智能客服系统示例
        console.log('\n👥 智能客服系统示例：');
        const customerService = new IntelligentCustomerService(
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_BASE_URL
        );

        console.log('系统状态:', customerService.getSystemStatus());

        // 模拟客户咨询
        const inquiries = [
            { id: 'Q1', question: '我的订单ORD123456什么时候能到？' },
            { id: 'Q2', question: '请问iPhone 15的价格和配置如何？' },
            { id: 'Q3', question: '我要申请退款，订单号是ORD789012' }
        ];

        console.log('处理批量客户咨询...');
        const results = await customerService.handleBatchInquiries(inquiries);
        console.log('批量处理结果:', results.map(r => ({
            id: r.id,
            success: r.result.success,
            hasError: !!r.error
        })));

        // 2. 代码助手示例
        console.log('\n💻 代码助手示例：');
        const codeAssistant = new CodeAssistantAgent(
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_BASE_URL
        );

        const sampleCode = `
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}
        `;

        const reviewResult = await codeAssistant.reviewCode(sampleCode, 'javascript', 'performance');
        console.log('代码审查结果:', {
            success: reviewResult.success,
            toolCallsCount: reviewResult.toolCalls.length
        });

    } catch (error) {
        console.error('❌ 集成示例运行失败:', error);
    }
}

/**
 * 高级用法示例：自定义流式处理器
 */
export class CustomStreamProcessor {
    private agent: UnifiedAgent;
    private eventLog: StreamEvent[] = [];

    constructor(agent: UnifiedAgent) {
        this.agent = agent;
        this.setupAdvancedListeners();
    }

    private setupAdvancedListeners(): void {
        const listener = this.agent.createStreamListener();

        listener.onStream((event: StreamEvent) => {
            this.eventLog.push(event);
            this.processEvent(event);
        });

        listener.onError((event: StreamEvent) => {
            console.error('流式处理错误:', event.data);
            this.eventLog.push(event);
        });

        listener.onComplete((result: AgentRunResult) => {
            this.generateReport(result);
        });
    }

    private processEvent(event: StreamEvent): void {
        switch (event.type) {
            case 'message_start':
                console.log('🎬 开始生成回复...');
                break;
            case 'message_chunk':
                // 实时显示生成的内容（可以用于UI更新）
                process.stdout.write(event.data.content);
                break;
            case 'message_end':
                console.log('\n✅ 回复生成完成');
                break;
            case 'tool_call_start':
                console.log(`🛠️  调用工具: ${event.data.toolName}`);
                break;
            case 'tool_call_end':
                console.log(`✨ 工具执行完成: ${event.data.toolName}`);
                break;
            case 'agent_switch':
                console.log(`🔄 切换到专家: ${event.data.toAgent}`);
                break;
        }
    }

    private generateReport(result: AgentRunResult): void {
        const eventTypes = this.eventLog.map(e => e.type);
        const uniqueEventTypes = [...new Set(eventTypes)];
        
        console.log('\n📊 执行报告:');
        console.log(`- 总事件数: ${this.eventLog.length}`);
        console.log(`- 事件类型: ${uniqueEventTypes.join(', ')}`);
        console.log(`- 工具调用次数: ${result.toolCalls.length}`);
        console.log(`- 执行时间: ${result.metadata?.duration}ms`);
        console.log(`- 执行状态: ${result.success ? '成功' : '失败'}`);
    }

    public async processWithReport(
        messages: any[],
        options?: AgentRunOptions
    ): Promise<AgentRunResult> {
        console.log('🚀 开始处理请求...');
        this.eventLog = []; // 清空事件日志
        
        return await this.agent.run(messages, {
            outputMode: OutputMode.STREAMING,
            ...options
        });
    }
}

// 如果直接运行此文件
if (require.main === module) {
    demonstrateIntegration().catch(console.error);
}